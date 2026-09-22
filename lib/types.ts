export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** For assistant messages: the model that actually answered (may differ from the
   * selected model if it was rate-limited and the app fell back to another free model). */
  respondedModel?: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export type ChatParams = {
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stop: string;
};
