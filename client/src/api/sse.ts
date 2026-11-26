import {
  ApiError,
  clearAuthToken,
  createApiUrl,
  createAuthHeaders,
  redirectToLogin,
} from "./httpClient";

export type SseMessage = {
  event: string;
  data: string;
};

/** 解析单个 SSE 块（支持 event:/data: 字段与注释行）。 */
export function parseSseBlock(block: string): SseMessage | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

/** 安全解析 SSE data 中的 JSON，畸形数据直接返回 null，不中断整条流。 */
export function parseSseJson<T>(message: SseMessage): T | null {
  try {
    return JSON.parse(message.data) as T;
  } catch {
    return null;
  }
}

export type StreamSseOptions = {
  init?: RequestInit;
  signal?: AbortSignal;
  onMessage: (message: SseMessage) => void;
};

/**
 * 带 Authorization 的 SSE 流式读取。EventSource 无法设置请求头，
 * 因此聊天与入库事件统一走 fetch + ReadableStream。
 */
export async function streamSse(path: string, options: StreamSseOptions): Promise<void> {
  const { init, signal, onMessage } = options;
  const headers = createAuthHeaders(init?.headers);
  headers.set("Accept", "text/event-stream");

  const response = await fetch(createApiUrl(path), { ...init, headers, signal });

  if (response.status === 401) {
    clearAuthToken();
    redirectToLogin();
    throw new ApiError("登录已过期，请重新登录", 401);
  }
  if (!response.ok || !response.body) {
    throw new ApiError(`HTTP ${response.status}`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const message = parseSseBlock(block);
        if (message) {
          onMessage(message);
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    // 冲刷流末尾未以空行分隔的最后一块。
    buffer += decoder.decode();
    const tail = parseSseBlock(buffer);
    if (tail) {
      onMessage(tail);
    }
  } finally {
    reader.releaseLock();
  }
}
