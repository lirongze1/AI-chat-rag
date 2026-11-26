import { z } from "zod";

function resolveRequiredUserId(data: { userId?: string; browserFingerprintHash?: string }) {
  return data.userId ?? data.browserFingerprintHash;
}

const md5HexSchema = z.string().regex(/^[a-fA-F0-9]{32}$/);

/* ------------------------------ Account auth ------------------------------ */

// Public registration is disabled; only phone/email + password login remains.
export const loginBodySchema = z.object({
  account: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

/* ------------------------------ Admin ---------------------------------- */

const phoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, "Invalid phone number");
const passwordSchema = z.string().min(8).max(128);
const userRoleSchema = z.enum(["ADMIN", "USER"]);

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const createAdminUserBodySchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
  role: userRoleSchema.optional(),
});

export const updateAdminUserBodySchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordBodySchema = z.object({
  newPassword: passwordSchema,
});

export const adminUserIdParamsSchema = z.object({
  userId: z.string().min(1),
});

// apiKey: "" keeps the stored value, null clears it, any other string replaces it.
const apiKeyFieldSchema = z.string().nullable().optional();

export const appConfigBodySchema = z.object({
  llm: z.object({
    apiKey: apiKeyFieldSchema,
    baseUrl: z.string().trim().max(500).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
  }),
  embedding: z.object({
    provider: z.string().trim().min(1).max(50).optional(),
    apiKey: apiKeyFieldSchema,
    model: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().max(500).optional(),
  }),
  retrieval: z.object({
    topK: z.number().int().min(1).max(100).optional(),
    scoreThreshold: z.number().min(0).max(1).optional(),
    contextMessageLimit: z.number().int().min(1).max(100).optional(),
  }),
  chunk: z.object({
    chunkSize: z.number().int().min(1).max(20000).optional(),
    chunkOverlap: z.number().int().min(0).max(10000).optional(),
    embeddingBatchSize: z.number().int().min(1).max(1000).optional(),
  }),
});

export const configTestBodySchema = z.object({
  kind: z.enum(["llm", "embedding"]),
});

/* ------------------------------- File upload ------------------------------ */

export const filePrecheckBodySchema = z.object({
  contentMd5: md5HexSchema,
});

export const chunkUploadInitBodySchema = z.object({
  uploadId: md5HexSchema,
  fileName: z.string().min(1),
  fileSizeBytes: z.coerce.number().int().positive(),
  totalChunks: z.coerce.number().int().min(1),
});

export const chunkUploadBodySchema = z.object({
  uploadId: md5HexSchema,
  chunkIndex: z.coerce.number().int().min(0),
});

export const chunkUploadStatusQuerySchema = z.object({
  uploadId: md5HexSchema,
});

export const chunkUploadCompleteBodySchema = z.object({
  uploadId: md5HexSchema,
});

// Knowledge-file parse lifecycle exposed to the frontend.
const parseStatusEnum = z.enum(["pending", "processing", "failed", "indexed"]);

export const filesQuerySchema = z.object({
  parseStatus: parseStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const taskParamsSchema = z.object({
  taskId: z.string().uuid(),
});

export const fileParamsSchema = z.object({
  fileId: z.string().uuid(),
});

export const fileDetailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

/* -------------------------------- Chat ----------------------------------- */

export const createSessionBodySchema = z.object({
  title: z.string().max(200).optional(),
});

export const sessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const sessionParamsSchema = z.object({
  id: z.string().uuid(),
});

export const deleteSessionsBodySchema = z.object({
  sessionIds: z.array(z.string().uuid()).min(1),
});

export const messageBodySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const chatCompletionBodySchema = z.object({
  content: z.string().min(1),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Input contract for forwarding user queries to Python AI service.
export const aiChatBodySchema = z.object({
  query: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  recentMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
});

/* --------------------- Service-to-service callbacks ---------------------- */

const taskStatusEnum = z.enum(["queued", "running", "success", "failed", "cancelled"]);

export const ingestionChunkSyncBodySchema = z
  .object({
    taskId: z.string().uuid(),
    fileId: z.string().uuid(),
    userId: z.string().min(1).optional(),
    browserFingerprintHash: z.string().min(1).optional(),
    collectionName: z.string().min(1),
    parseVersion: z.coerce.number().int().min(1).default(1),
    chunks: z.array(z.object({
      chunkIndex: z.coerce.number().int().min(0),
      vectorId: z.string().min(1),
      chunkHash: z.string().min(1),
      contentPreview: z.string().min(1),
      pageNumber: z.coerce.number().int().min(0).nullable().optional(),
    })).default([]),
  })
  .superRefine((data, ctx) => {
    if (!resolveRequiredUserId(data)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["userId"], message: "Required" });
    }
  })
  .transform((data) => ({
    taskId: data.taskId,
    fileId: data.fileId,
    userId: resolveRequiredUserId(data)!,
    collectionName: data.collectionName,
    parseVersion: data.parseVersion,
    chunks: data.chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      vectorId: chunk.vectorId,
      chunkHash: chunk.chunkHash,
      contentPreview: chunk.contentPreview,
      pageNumber: chunk.pageNumber ?? null,
    })),
  }));

export const ingestionCallbackBodySchema = z.object({
  taskId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  status: taskStatusEnum,
  progress: z.number().min(0).max(100).optional(),
  chunkCount: z.coerce.number().int().min(0).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});
