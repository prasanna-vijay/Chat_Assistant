import os
import random
import time
from datetime import date, datetime

import gradio as gr
from dotenv import load_dotenv

import ingestion
import providers
from models import DEFAULT_MODEL, MODELS, PROVIDER_ORDER, model_by_id

load_dotenv(".env.local")

DEFAULT_PARAMS = {
    "model": DEFAULT_MODEL,
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 1024,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0,
    "stop": "",
}

MODEL_CHOICES = [
    (f"{provider} · {m.label}", m.id)
    for provider in PROVIDER_ORDER
    for m in MODELS
    if m.provider == provider
]


def new_id() -> str:
    return f"{random.getrandbits(32):08x}{int(time.time() * 1000):x}"


def group_label(updated_at_ms: float) -> str:
    today = date.today()
    d = datetime.fromtimestamp(updated_at_ms / 1000).date()
    diff_days = (today - d).days
    if diff_days <= 0:
        return "Today"
    if diff_days == 1:
        return "Yesterday"
    if diff_days <= 7:
        return "Previous 7 days"
    return "Older"


def find_conversation(conversations, conv_id):
    return next((c for c in conversations if c["id"] == conv_id), None)


def model_label(model_id: str) -> str:
    option = model_by_id(model_id)
    return option.label if option else model_id


def messages_to_chatbot(conversations, active_id, current_model_id):
    conv = find_conversation(conversations, active_id)
    if not conv:
        return []
    out = []
    for m in conv["messages"]:
        content = m["content"]
        responded = m.get("respondedModel")
        if m["role"] == "assistant" and responded and responded != current_model_id:
            content += f"\n\n<sub>Answered by {model_label(responded)} (your selected model was rate-limited)</sub>"
        out.append({"role": m["role"], "content": content})
    return out


# ---------------------------------------------------------------------------
# Sending a message: streams the reply, falling back through the rest of the
# free model list on failure (errors are often provider-specific — a rate
# limit, a missing key for just that provider, a param one API rejects —
# rather than something that would fail identically for every model).
# ---------------------------------------------------------------------------
def send_message(user_text, conversations, active_id, params):
    user_text = (user_text or "").strip()
    if not user_text:
        return

    user_msg = {"id": new_id(), "role": "user", "content": user_text}
    assistant_msg = {"id": new_id(), "role": "assistant", "content": ""}

    conv = find_conversation(conversations, active_id)
    if conv:
        history_for_request = [{"role": m["role"], "content": m["content"]} for m in conv["messages"]]
        history_for_request.append({"role": "user", "content": user_text})
        conv["messages"].append(user_msg)
        conv["messages"].append(assistant_msg)
        conv["updatedAt"] = time.time() * 1000
    else:
        active_id = new_id()
        history_for_request = [{"role": "user", "content": user_text}]
        title = user_text[:40] + ("…" if len(user_text) > 40 else "")
        conv = {"id": active_id, "title": title, "messages": [user_msg, assistant_msg], "updatedAt": time.time() * 1000}
        conversations = [conv, *conversations]

    yield (
        messages_to_chatbot(conversations, active_id, params["model"]),
        conversations,
        active_id,
        gr.update(value="", interactive=False),
        "",
        gr.update(interactive=False),
    )

    selected = model_by_id(params["model"]) or model_by_id(DEFAULT_MODEL)
    candidates = [selected, *[m for m in MODELS if m.id != selected.id]]
    stop_list = [s.strip() for s in params.get("stop", "").split(",") if s.strip()] or None
    request_params = {**params, "stop": stop_list}

    retrieved_docs = ingestion.retrieve(user_text)
    if retrieved_docs:
        context_msg = {
            "role": "system",
            "content": (
                "You have access to the following excerpts from the user's uploaded documents. "
                "If they answer the user's question, base your answer on them. "
                "If they do NOT contain the answer, say so explicitly at the start of your reply "
                "(e.g. \"I couldn't find this in your uploaded document, so here's a general "
                "answer:\") and then answer normally from your own knowledge instead.\n\n"
                + ingestion.format_context(retrieved_docs)
            ),
        }
        history_for_request = [context_msg, *history_for_request]

    last_error = None
    succeeded = False

    for candidate in candidates:
        try:
            resp = providers.open_stream(candidate, history_for_request, request_params)
        except Exception as exc:
            last_error = str(exc)
            continue

        assistant_msg["respondedModel"] = candidate.id
        content = ""
        try:
            for delta in providers.iter_deltas(resp):
                content += delta
                assistant_msg["content"] = content
                yield (
                    messages_to_chatbot(conversations, active_id, params["model"]),
                    conversations,
                    active_id,
                    gr.update(interactive=False),
                    "",
                    gr.update(interactive=False),
                )
        except Exception as exc:
            last_error = str(exc)
            break

        succeeded = True
        break

    if succeeded and retrieved_docs:
        assistant_msg["content"] += f"\n\n<sub>Document excerpts checked: {ingestion.format_sources(retrieved_docs)}</sub>"

    error_text = ""
    if not succeeded:
        error_text = f"All models failed. Last error: {last_error}" if last_error else "All models are currently unavailable. Try again shortly."

    yield (
        messages_to_chatbot(conversations, active_id, params["model"]),
        conversations,
        active_id,
        gr.update(interactive=True),
        error_text,
        gr.update(interactive=True),
    )


def select_conversation(conversations, active_id, params):
    return messages_to_chatbot(conversations, active_id, params["model"]), ""


def new_chat():
    return None, [], ""


def params_dirty(model, temperature, top_p, max_tokens, freq_penalty, pres_penalty, stop, saved):
    draft = {
        "model": model,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
        "frequency_penalty": freq_penalty,
        "presence_penalty": pres_penalty,
        "stop": stop,
    }
    dirty = draft != saved
    return gr.update(value="Save changes" if dirty else "Saved", interactive=dirty)


def save_params(model, temperature, top_p, max_tokens, freq_penalty, pres_penalty, stop, conversations, active_id):
    new_saved = {
        "model": model,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
        "frequency_penalty": freq_penalty,
        "presence_penalty": pres_penalty,
        "stop": stop,
    }
    badge = f"**Chat Assistant** · {model_label(model)}"
    chatbot = messages_to_chatbot(conversations, active_id, model)
    return new_saved, gr.update(value="Saved", interactive=False), badge, chatbot


def upload_document(file_path):
    if not file_path:
        return "Choose a PDF file first."
    try:
        count = ingestion.ingest_document(file_path, os.path.basename(file_path))
    except ingestion.IngestionError as exc:
        return f"⚠️ {exc}"
    return f"Indexed {count} page(s) into Qdrant."


def on_load(conversations, active_id, params):
    if active_id and not find_conversation(conversations, active_id):
        active_id = None
    chatbot = messages_to_chatbot(conversations, active_id, params["model"])
    badge = f"**Chat Assistant** · {model_label(params['model'])}"
    return (
        active_id,
        chatbot,
        badge,
        params["model"],
        params["temperature"],
        params["top_p"],
        params["max_tokens"],
        params["frequency_penalty"],
        params["presence_penalty"],
        params["stop"],
    )


CSS = """
.sidebar-group-label { color: var(--body-text-color-subdued); font-size: 11px; text-transform: uppercase; margin: 8px 4px 2px; }
.sidebar-row { gap: 4px !important; }
.sidebar-item, .sidebar-item-active { text-align: left !important; justify-content: flex-start !important; }
.sidebar-item-active { background: var(--block-background-fill) !important; }
.sidebar-delete { max-width: 32px; min-width: 32px; }
.sidebar-empty { color: var(--body-text-color-subdued); font-size: 13px; padding: 8px 4px; }
#model-badge { margin-bottom: 4px; }
"""

with gr.Blocks(title="Chat Assistant") as demo:
    conversations_state = gr.BrowserState([], storage_key="chat_assistant_conversations")
    active_id_state = gr.BrowserState(None, storage_key="chat_assistant_active_id")
    params_state = gr.BrowserState(DEFAULT_PARAMS, storage_key="chat_assistant_params")

    with gr.Row():
        with gr.Column(scale=2, min_width=220):
            gr.Markdown("### Chat Assistant")
            new_chat_btn = gr.Button("+ New chat", variant="primary")

            # Rebuilt from scratch whenever conversations/active_id change, since the
            # number of rows (and their per-row delete handlers) is dynamic.
            @gr.render(inputs=[conversations_state, active_id_state])
            def render_sidebar(conversations, active_id):
                if not conversations:
                    gr.Markdown("No chats yet. Start a new one above.", elem_classes=["sidebar-empty"])
                    return

                groups: dict[str, list] = {}
                for c in sorted(conversations, key=lambda c: c["updatedAt"], reverse=True):
                    groups.setdefault(group_label(c["updatedAt"]), []).append(c)

                for label in ["Today", "Yesterday", "Previous 7 days", "Older"]:
                    if label not in groups:
                        continue
                    gr.Markdown(f"**{label}**", elem_classes=["sidebar-group-label"])
                    for c in groups[label]:
                        with gr.Row(elem_classes=["sidebar-row"]):
                            select_btn = gr.Button(
                                c["title"] or "New chat",
                                elem_classes=["sidebar-item-active" if c["id"] == active_id else "sidebar-item"],
                                size="sm",
                                scale=8,
                            )
                            delete_btn = gr.Button("×", size="sm", scale=1, elem_classes=["sidebar-delete"])

                            select_btn.click(lambda cid=c["id"]: cid, outputs=[active_id_state])

                            def do_delete(conversations, active_id, cid=c["id"]):
                                conversations = [x for x in conversations if x["id"] != cid]
                                if active_id == cid:
                                    active_id = None
                                return conversations, active_id

                            delete_btn.click(
                                do_delete,
                                inputs=[conversations_state, active_id_state],
                                outputs=[conversations_state, active_id_state],
                            )

            gr.Markdown("Free-tier models via OpenRouter, Gemini & Groq", elem_classes=["sidebar-empty"])

            gr.Markdown("### Knowledge base")
            upload_file = gr.File(label="Upload a PDF to index", file_types=[".pdf"])
            upload_btn = gr.Button("Index document")
            upload_status = gr.Markdown("")

        with gr.Column(scale=5):
            model_badge = gr.Markdown(f"**Chat Assistant** · {model_label(DEFAULT_MODEL)}", elem_id="model-badge")
            chatbot = gr.Chatbot(height=520, show_label=False)
            error_md = gr.Markdown("")
            with gr.Row():
                textbox = gr.Textbox(
                    placeholder="Message the assistant... (Enter to send, Shift+Enter for a new line)",
                    show_label=False,
                    scale=8,
                    lines=1,
                    max_lines=6,
                )
                send_btn = gr.Button("Send", variant="primary", scale=1)
            gr.Markdown(
                "Enter to send, Shift+Enter for a new line · Free-tier models can be rate-limited or unavailable at times.",
                elem_classes=["sidebar-empty"],
            )

        with gr.Column(scale=2, min_width=260):
            gr.Markdown("### Parameters")
            model_dd = gr.Dropdown(choices=MODEL_CHOICES, value=DEFAULT_MODEL, label="Model")
            temperature_sl = gr.Slider(0, 2, value=DEFAULT_PARAMS["temperature"], step=0.1, label="Temperature")
            top_p_sl = gr.Slider(0, 1, value=DEFAULT_PARAMS["top_p"], step=0.05, label="Top P")
            max_tokens_num = gr.Number(value=DEFAULT_PARAMS["max_tokens"], minimum=1, maximum=8192, precision=0, label="Max tokens")
            freq_penalty_sl = gr.Slider(-2, 2, value=DEFAULT_PARAMS["frequency_penalty"], step=0.1, label="Frequency penalty")
            pres_penalty_sl = gr.Slider(-2, 2, value=DEFAULT_PARAMS["presence_penalty"], step=0.1, label="Presence penalty")
            stop_tb = gr.Textbox(value=DEFAULT_PARAMS["stop"], label="Stop sequences", placeholder="comma, separated")
            save_btn = gr.Button("Saved", interactive=False)

    param_widgets = [model_dd, temperature_sl, top_p_sl, max_tokens_num, freq_penalty_sl, pres_penalty_sl, stop_tb]

    gr.on(
        triggers=[w.change for w in param_widgets],
        fn=params_dirty,
        inputs=[*param_widgets, params_state],
        outputs=[save_btn],
    )
    save_btn.click(
        save_params,
        inputs=[*param_widgets, conversations_state, active_id_state],
        outputs=[params_state, save_btn, model_badge, chatbot],
    )

    upload_btn.click(upload_document, inputs=[upload_file], outputs=[upload_status])

    new_chat_btn.click(new_chat, outputs=[active_id_state, chatbot, error_md])
    active_id_state.change(
        select_conversation, inputs=[conversations_state, active_id_state, params_state], outputs=[chatbot, error_md]
    )

    send_inputs = [textbox, conversations_state, active_id_state, params_state]
    send_outputs = [chatbot, conversations_state, active_id_state, textbox, error_md, send_btn]
    textbox.submit(send_message, inputs=send_inputs, outputs=send_outputs)
    send_btn.click(send_message, inputs=send_inputs, outputs=send_outputs)

    demo.load(
        on_load,
        inputs=[conversations_state, active_id_state, params_state],
        outputs=[active_id_state, chatbot, model_badge, *param_widgets],
    )

if __name__ == "__main__":
    demo.queue().launch(css=CSS, theme=gr.themes.Base())
