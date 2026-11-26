import { createApiError } from "../common/errors";
import { config } from "../config";

interface AiChatPayload {
  query: string;
  sessionId?: string;
  userId: string;
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

interface AiChatResult {
  answer: string;
  sources?: unknown[];
}

function createAiServiceHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-ai-service-secret": config.aiServiceSharedSecret,
    ...(extraHeaders || {}),
  };
}

function toAiServiceError(error: unknown): never {
  if (error instanceof Error && error.name === "AbortError") {
    throw createApiError(504, "AI_SERVICE_TIMEOUT", "AI service timeout");
  }
  if ((error as { code?: string })?.code) {
    throw error;
  }
  throw createApiError(502, "AI_SERVICE_UNAVAILABLE", "AI service unavailable");
}

/**
 * Forward a chat request to the Python AI service with the authenticated user ID.
 */
export async function requestChat(payload: AiChatPayload): Promise<AiChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);

  try {
    const response = await fetch(`${config.aiServiceBaseUrl}/chat`, {
      method: "POST",
      headers: createAiServiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...payload,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createApiError(502, "AI_SERVICE_ERROR", `AI service returned ${response.status}`);
    }

    return (await response.json()) as AiChatResult;
  } catch (error) {
    return toAiServiceError(error);
  } finally {
    clearTimeout(timer);
  }
}

/** Open a streaming chat request to the Python AI service. */
export async function streamChat(payload: AiChatPayload): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);

  try {
    const response = await fetch(`${config.aiServiceBaseUrl}/chat/stream`, {
      method: "POST",
      headers: createAiServiceHeaders({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      }),
      body: JSON.stringify({
        ...payload,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw createApiError(502, "AI_SERVICE_ERROR", `AI service returned ${response.status}`);
    }

    return response;
  } catch (error) {
    return toAiServiceError(error);
  } finally {
    // Streaming continues after headers arrive; the upstream reader owns the rest.
    clearTimeout(timer);
  }
}

/**
 * Dispatch an ingestion job to the Python AI service.
 * Failures are thrown so the scheduler can persist them and retry with backoff.
 */
export async function dispatchIngestionTask(payload: {
  taskId: string;
  fileId: string;
  userId: string;
  fileName: string;
  fileExt: string;
  fileSizeBytes: number;
  contentMd5: string;
  storagePath: string;
  absoluteFilePath: string;
  parseVersion: number;
}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);

  try {
    const response = await fetch(config.aiIngestionEndpoint, {
      method: "POST",
      headers: createAiServiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createApiError(502, "AI_SERVICE_ERROR", `AI ingestion service returned ${response.status}`);
    }
  } catch (error) {
    return toAiServiceError(error);
  } finally {
    clearTimeout(timer);
  }
}

/** Delete all vector chunks of a file in the AI service. */
export async function deleteFileVectors(fileId: string, userId: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);

  try {
    const response = await fetch(
      `${config.aiVectorDeleteEndpoint}/${encodeURIComponent(fileId)}?user_id=${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: createAiServiceHeaders(),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw createApiError(502, "AI_SERVICE_ERROR", `AI service returned ${response.status}`);
    }
  } catch (error) {
    return toAiServiceError(error);
  } finally {
    clearTimeout(timer);
  }
}
