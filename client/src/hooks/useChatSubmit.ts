import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ChatMessage, ChatSession } from "../api";
import {
  createChatSessionFromUserMessage,
  sendChatMessage,
} from "../workservice/chatWorkservice";

type UseChatSubmitParams = {
  activeSessionId: string | null;
  draft: string;
  isLoading: boolean;
  onSessionCreated?: (sessionId: string) => void;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<ChatSession[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

function createAssistantPlaceholder(id: string, sessionId: string): ChatMessage {
  return {
    id,
    sessionId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    sources: [],
  };
}

/**
 * 聚合聊天发送与流式回填逻辑，避免路由组件直接承载完整的消息事件状态机。
 * Encapsulates chat submission and streaming reconciliation so the route
 * component does not need to carry the full message event state machine.
 */
export function useChatSubmit({
  activeSessionId,
  draft,
  isLoading,
  onSessionCreated,
  setActiveSessionId,
  setSessions,
  setMessages,
  setDraft,
  setIsLoading,
  setErrorMessage,
}: UseChatSubmitParams) {
  const streamControllerRef = useRef<AbortController | null>(null);

  /** 中止当前流式请求（新建会话、切换会话或组件卸载时调用）。 */
  function abortStream() {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
  }

  useEffect(() => () => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
  }, []);

  /**
   * 发送当前草稿，必要时先创建会话，再使用 SSE 事件逐步替换 assistant 占位消息。
   * Sends the current draft, lazily creates a session when needed, and uses
   * SSE events to progressively replace an optimistic assistant placeholder.
   */
  async function handleSubmit() {
    const content = draft.trim();
    if (!content || isLoading) {
      return;
    }

    // 新请求（含新建会话后的首次发送）先中止上一条流，避免旧事件回填。
    abortStream();

    let optimisticAssistantId: string | null = null;

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const session = await createChatSessionFromUserMessage(content);
        setSessions((current) => [session, ...current]);
        onSessionCreated?.(session.id);
        setActiveSessionId(session.id);
        sessionId = session.id;
      }

      optimisticAssistantId = crypto.randomUUID();
      const assistantDraftId = optimisticAssistantId;
      setDraft("");
      setIsLoading(true);
      setErrorMessage(null);

      setMessages((current) => ([
        ...current,
        createAssistantPlaceholder(assistantDraftId, sessionId),
      ]));

      const controller = new AbortController();
      streamControllerRef.current = controller;

      await sendChatMessage(sessionId, content, (event) => {
        if (event.type === "message.started" && event.userMessage) {
          const userMessage = event.userMessage;

          setMessages((current) => {
            const withoutDraft = current.filter((item) => item.id !== assistantDraftId);
            return [
              ...withoutDraft,
              userMessage,
              createAssistantPlaceholder(assistantDraftId, sessionId),
            ];
          });
          return;
        }

        if (event.type === "message.delta") {
          setMessages((current) => current.map((item) => (
            item.id === assistantDraftId
              ? { ...item, content: `${item.content}${event.delta}` }
              : item
          )));
          return;
        }

        if (event.type === "message.sources") {
          setMessages((current) => current.map((item) => (
            item.id === assistantDraftId
              ? { ...item, sources: event.sources }
              : item
          )));
          return;
        }

        if (event.type === "message.completed") {
          setMessages((current) => current.map((item) => (
            item.id === assistantDraftId
              ? event.assistantMessage
              : item
          )));
          setSessions((current) => current.map((item) => (
            item.id === sessionId
              ? { ...item, messageCount: item.messageCount + 2 }
              : item
          )));
          setIsLoading(false);
          return;
        }

        if (event.type === "message.failed") {
          setMessages((current) => current.filter((item) => item.id !== assistantDraftId));
          setErrorMessage(event.message || "Chat generation failed");
          setIsLoading(false);
        }
      });

      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
      }
      setIsLoading(false);
    } catch (error) {
      const isAbortError = error instanceof Error && error.name === "AbortError";
      if (optimisticAssistantId) {
        setMessages((current) => current.filter((item) => item.id !== optimisticAssistantId));
      }
      // 被新请求/卸载主动中止时不报错，也不覆盖新请求的 loading 状态。
      if (!isAbortError) {
        setErrorMessage(error instanceof Error ? error.message : "Chat generation failed");
        setIsLoading(false);
      }
    }
  }

  return { handleSubmit, abortStream };
}