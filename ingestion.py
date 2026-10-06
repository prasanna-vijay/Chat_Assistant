import os

from langchain_community.document_loaders import PyPDFLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore

# text-embedding-004 (Google's previous small embedding model) has been retired.
# gemini-embedding-001 is now the only embedding model on the Gemini API, so we
# ask for its output truncated to 768 dimensions (vs. the full 3072) to keep a
# "small" embedding footprint, via Matryoshka representation learning. Free
# tier, but with a low daily request cap.
EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768

DEFAULT_COLLECTION_NAME = "chat_assistant_docs"


class IngestionError(Exception):
    pass


def load_pages(file_path: str, source_name: str) -> list:
    """Loads a PDF and returns one LangChain Document per page. The chunking
    strategy is "one page = one chunk" rather than further splitting by size."""
    if not file_path.lower().endswith(".pdf"):
        raise IngestionError("Only PDF documents are supported right now.")

    pages = PyPDFLoader(file_path).load()
    if not pages:
        raise IngestionError("No readable pages found in this document.")

    for i, page in enumerate(pages):
        page.metadata["source"] = source_name
        page.metadata["page"] = i + 1

    return pages


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise IngestionError("GEMINI_API_KEY is not set. Add it to .env.local and restart the app.")
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=api_key,
        output_dimensionality=EMBEDDING_DIMENSIONS,
    )


def _vector_store_config():
    qdrant_url = os.environ.get("QDRANT_URL")
    collection_name = os.environ.get("QDRANT_COLLECTION_NAME") or DEFAULT_COLLECTION_NAME
    qdrant_api_key = os.environ.get("QDRANT_API_KEY") or None
    return qdrant_url, qdrant_api_key, collection_name


def retrieve(query: str, k: int = 4) -> list:
    """Returns the top-k most relevant page-chunks for a chat query, for
    retrieval-augmented generation. Best-effort: returns [] (instead of raising)
    whenever Qdrant isn't configured, the collection doesn't exist yet (nothing
    has been indexed), or the lookup fails for any other reason — RAG is an
    optional enhancement and chat should keep working without it."""
    qdrant_url, qdrant_api_key, collection_name = _vector_store_config()
    if not qdrant_url:
        return []
    try:
        store = QdrantVectorStore.from_existing_collection(
            embedding=get_embeddings(),
            url=qdrant_url,
            api_key=qdrant_api_key,
            collection_name=collection_name,
        )
        return store.similarity_search(query, k=k)
    except Exception:
        return []


def format_context(docs: list) -> str:
    parts = []
    for doc in docs:
        source = doc.metadata.get("source", "document")
        page = doc.metadata.get("page")
        label = f"{source} (page {page})" if page else source
        parts.append(f"[{label}]\n{doc.page_content}")
    return "\n\n".join(parts)


def format_sources(docs: list) -> str:
    labels = sorted({f"{d.metadata.get('source', 'document')} (p.{d.metadata.get('page', '?')})" for d in docs})
    return ", ".join(labels)


def ingest_document(file_path: str, source_name: str) -> int:
    """Runs the full pipeline: load -> page-chunk -> embed (Gemini) -> upsert
    into Qdrant. Returns the number of page-chunks ingested."""
    qdrant_url, qdrant_api_key, collection_name = _vector_store_config()
    if not qdrant_url:
        raise IngestionError("QDRANT_URL is not set. Add it to .env.local and restart the app.")

    pages = load_pages(file_path, source_name)
    embeddings = get_embeddings()

    try:
        QdrantVectorStore.from_documents(
            pages,
            embedding=embeddings,
            url=qdrant_url,
            api_key=qdrant_api_key,
            collection_name=collection_name,
        )
    except Exception as exc:
        raise IngestionError(f"Failed to store vectors in Qdrant: {exc}") from exc

    return len(pages)
