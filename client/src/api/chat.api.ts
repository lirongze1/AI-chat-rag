import { requestApi } from "./httpClient";
import { parseSseJson, streamSse } from "./sse";

export type ChatMessageSource = {
  fileId?: string;
  fileName?: string;
  pageNumber?: number | null;
  chunkIndex?: number | null;
  snippet?: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources?: ChatMessageSource[];
};

export type ChatSession = {
  id: string;
  userId: string;
  title?: string | null;
  createdAt: string;
  messageCount: number;
};

export type ChatCompletionEvent =
  | { type: "message.started"; userMessage?: ChatMessage }
  | { type: "message.delta"; delta: string }
  | { type: "message.sources"; sources: ChatMessageSource[] }
  | { type: "message.completed"; assistantMessage: ChatMessage }
  | { type: "message.failed"; code?: string; message?: string };

/** 用户身份完全由后端从 Bearer Token 解析，请求体/查询串不再携带 userId。 */
export async function createChatSession(title?: string) {
  return requestApi<ChatSession>("/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function getChatSessions(limit = 50) {
  return requestApi<ChatSession[]>(`/chat/sessions?limit=${encodeURIComponent(String(limit))}`);
}

export async function getChatMessages(sessionId: string, limit = 100) {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestApi<ChatMessage[]>(`/chat/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`);
}

export async function deleteChatSession(sessionId: string) {
  return requestApi<{ id: string }>(`/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function deleteChatSessions(sessionIds: string[]) {
  return requestApi<{ deletedCount: number }>("/chat/sessions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionIds }),
  });
}

/**
 * 流式发送聊天消息。通过公共 SSE 工具解析，支持中止；
 * 单块畸形 JSON 会被跳过，不会中断整条流。
 */
export async function streamChatCompletion(
  sessionId: string,
  content: string,
  onEvent: (event: ChatCompletionEvent) => void,
  signal?: AbortSignal,
) {
  await streamSse(`/chat/sessions/${encodeURIComponent(sessionId)}/completions`, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
    signal,
    onMessage: (message) => {
      const payload = parseSseJson<Record<string, unknown>>(message);
      if (!payload || typeof payload !== "object") {
        return;
      }

      // 兼容 event 名直接给出消息类型，或 event: message + data.type 两种约定。
      const eventName = message.event !== "message" && message.event
        ? message.event
        : typeof payload.type === "string"
          ? payload.type
          : "message";

      if (eventName === "message.started") {
        onEvent({
          type: "message.started",
          userMessage: payload.userMessage as ChatMessage | undefined,
        });
        return;
      }

      if (eventName === "message.delta") {
        onEvent({ type: "message.delta", delta: String(payload.delta ?? "") });
        return;
      }

      if (eventName === "message.sources") {
        onEvent({
          type: "message.sources",
          sources: (payload.sources as ChatMessageSource[] | undefined) ?? [],
        });
        return;
      }

      if (eventName === "message.completed") {
        const assistantMessage = payload.assistantMessage as ChatMessage | undefined;
        if (assistantMessage) {
          onEvent({ type: "message.completed", assistantMessage });
        }
        return;
      }

      // message.failed / error / message.error 统一兜底为失败事件。
      if (
        eventName === "message.failed"
        || eventName === "error"
        || eventName === "message.error"
      ) {
        onEvent({
          type: "message.failed",
          code: typeof payload.code === "string" ? payload.code : undefined,
          message: typeof payload.message === "string"
            ? payload.message
            : "Chat generation failed",
        });
      }
    },
  });
}
