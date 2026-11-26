import {
  createChatSession,
  deleteChatSession,
  deleteChatSessions,
  getChatMessages,
  getChatSessions,
  streamChatCompletion,
  type ChatCompletionEvent,
} from "../api";

export async function loadChatSessions() {
  return getChatSessions();
}

export async function loadSessionMessages(sessionId: string) {
  return getChatMessages(sessionId);
}

export async function createChatSessionFromUserMessage(content: string) {
  return createChatSession(content.slice(0, 200));
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
  onEvent: (event: ChatCompletionEvent) => void,
  signal?: AbortSignal,
) {
  return streamChatCompletion(sessionId, content, onEvent, signal);
}

export async function removeChatSession(sessionId: string) {
  return deleteChatSession(sessionId);
}

export async function removeChatSessions(sessionIds: string[]) {
  return deleteChatSessions(sessionIds);
}
