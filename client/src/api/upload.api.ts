import { requestApi } from "./httpClient";
import { parseSseJson, streamSse } from "./sse";

export type FileParseStatus = "pending" | "processing" | "failed" | "indexed";

export type KnowledgeFileInfo = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  parseStatus: FileParseStatus;
  uploadedAt: string;
};

export type KnowledgeFilesPage = {
  items: KnowledgeFileInfo[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

export type KnowledgeFileChunkDetail = {
  id: string;
  chunkIndex: number;
  vectorId: string;
  collectionName: string;
  chunkHash: string;
  contentPreview: string;
  pageNumber: number | null;
  createdAt: string;
};

export type KnowledgeFileDetail = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  parseStatus: FileParseStatus;
  parseVersion: number;
  chunkCount: number;
  contentMd5: string | null;
  storagePath: string;
  indexedAt: string | null;
  uploadedAt: string;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  chunks: KnowledgeFileChunkDetail[];
};

export type IngestionStreamEvent = {
  type: string;
  timestamp: string;
  file?: KnowledgeFileInfo;
  task?: {
    id: string;
    status: string;
    progress: number;
    errorMessage: string | null;
  };
};

export type UploadResult = {
  file: KnowledgeFileInfo;
};

export type ManualIngestionDispatchResult = {
  accepted: boolean;
  file: KnowledgeFileInfo;
  task: {
    id: string;
    status: string;
    progress: number;
    errorMessage: string | null;
  };
};

export type FileMutationResult = {
  success: boolean;
  file?: KnowledgeFileInfo;
  task?: {
    id: string;
    status: string;
    progress: number;
    errorMessage: string | null;
  } | null;
  fileId?: string;
};

export type UploadPrecheckResult = {
  exists: boolean;
  file: {
    id: string;
    fileName: string;
    parseStatus: FileParseStatus;
    uploadedAt: string;
  } | null;
};

export type ChunkSession = {
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number[];
};

/** 检查当前登录用户是否已存在相同 MD5 的文件。 */
export async function precheckUploadFile(contentMd5: string): Promise<UploadPrecheckResult> {
  return requestApi<UploadPrecheckResult>("/files/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentMd5 }),
  });
}

/** 获取当前登录用户的知识库文件列表。 */
export async function getKnowledgeFiles(
  options?: { parseStatus?: FileParseStatus; page?: number; limit?: number },
): Promise<KnowledgeFilesPage> {
  const params = new URLSearchParams();

  if (options?.parseStatus) {
    params.set("parseStatus", options.parseStatus);
  }
  if (typeof options?.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  return requestApi<KnowledgeFilesPage>(`/files${query ? `?${query}` : ""}`);
}

/** 获取单个文件详情，用户身份由 token 决定。 */
export async function getKnowledgeFileDetail(
  fileId: string,
  options?: { page?: number; limit?: number },
): Promise<KnowledgeFileDetail> {
  const params = new URLSearchParams();
  if (typeof options?.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return requestApi<KnowledgeFileDetail>(
    `/files/${encodeURIComponent(fileId)}/detail${query ? `?${query}` : ""}`,
  );
}

/** 直传小文件接口。 */
export async function uploadFileDirect(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  return requestApi<UploadResult>("/files/upload", {
    method: "POST",
    body: formData,
  });
}

/** 初始化分片上传会话。 */
export async function initChunkUpload(payload: {
  uploadId: string;
  fileName: string;
  fileSizeBytes: number;
  totalChunks: number;
}): Promise<ChunkSession> {
  return requestApi<ChunkSession>("/files/upload/chunked/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 查询分片上传会话状态。 */
export async function getChunkUploadStatus(uploadId: string): Promise<ChunkSession> {
  return requestApi<ChunkSession>(`/files/upload/chunked/status?uploadId=${encodeURIComponent(uploadId)}`);
}

/** 上传单个分片。 */
export async function uploadChunk(uploadId: string, chunkIndex: number, blob: Blob): Promise<ChunkSession> {
  const formData = new FormData();
  formData.append("uploadId", uploadId);
  formData.append("chunkIndex", String(chunkIndex));
  formData.append("file", blob);

  return requestApi<ChunkSession>("/files/upload/chunked/chunk", {
    method: "POST",
    body: formData,
  });
}

/** 合并分片并完成上传。 */
export async function completeChunkUpload(uploadId: string): Promise<UploadResult> {
  return requestApi<UploadResult>("/files/upload/chunked/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId }),
  });
}

export async function dispatchPendingKnowledgeFile(fileId: string): Promise<ManualIngestionDispatchResult> {
  return requestApi<ManualIngestionDispatchResult>(`/files/${encodeURIComponent(fileId)}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function offloadIndexedKnowledgeFile(fileId: string): Promise<FileMutationResult> {
  return requestApi<FileMutationResult>(`/files/${encodeURIComponent(fileId)}/offload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function deleteKnowledgeFile(fileId: string): Promise<FileMutationResult> {
  return requestApi<FileMutationResult>(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

/**
 * 订阅当前用户的入库事件。EventSource 无法携带 Authorization，
 * 因此改用带 token 的 fetch + ReadableStream，并支持中止。
 */
export async function streamIngestionEvents(
  onEvent: (event: IngestionStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamSse("/files/events", {
    signal,
    onMessage: (message) => {
      const payload = parseSseJson<IngestionStreamEvent>(message);
      if (!payload || typeof payload.type !== "string") {
        return;
      }

      const eventName = message.event && message.event !== "message"
        ? message.event
        : payload.type;
      if (eventName === "ingestion.updated" || payload.type.startsWith("ingestion.")) {
        onEvent(payload);
      }
    },
  });
}
