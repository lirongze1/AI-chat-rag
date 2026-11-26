/**
 * Centralized runtime configuration.
 * Importing this module fails fast when a required secret is missing or blank.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[config] ${name} must be a positive number`);
  }
  return value;
}

const clientOrigins = requireEnv("CLIENT_ORIGIN")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (clientOrigins.length === 0) {
  throw new Error("[config] CLIENT_ORIGIN must contain at least one origin");
}

export const config = {
  port: numberEnv("PORT", 3001),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || "7d",
  clientOrigins,
  aiServiceBaseUrl: process.env.AI_SERVICE_BASE_URL?.trim() || "http://127.0.0.1:8000",
  aiServiceTimeoutMs: numberEnv("AI_SERVICE_TIMEOUT_MS", 12000),
  aiServiceSharedSecret: requireEnv("AI_SERVICE_SHARED_SECRET"),
  aiIngestionEndpoint:
    process.env.AI_INGESTION_ENDPOINT?.trim() ||
    `${process.env.AI_SERVICE_BASE_URL?.trim() || "http://127.0.0.1:8000"}/ingestion/jobs`,
  aiVectorDeleteEndpoint:
    process.env.AI_VECTOR_DELETE_ENDPOINT?.trim() ||
    `${process.env.AI_SERVICE_BASE_URL?.trim() || "http://127.0.0.1:8000"}/vectors/files`,
  uploadMaxFileSizeMb: numberEnv("UPLOAD_MAX_FILE_SIZE_MB", 20),
  ingestionRunningTimeoutMs: numberEnv("INGESTION_RUNNING_TIMEOUT_MS", 300000),
  ingestionPollIntervalMs: numberEnv("INGESTION_POLL_INTERVAL_MS", 10000),
  ingestionRetryBaseMs: numberEnv("INGESTION_RETRY_BASE_MS", 1000),
  ingestionRetryMaxMs: numberEnv("INGESTION_RETRY_MAX_MS", 60000),
  ingestionMaxAttempts: numberEnv("INGESTION_MAX_ATTEMPTS", 8),

  // Required: first-start administrator bootstrap. Password is only hashed in memory.
  bootstrapAdminPhone: requireEnv("BOOTSTRAP_ADMIN_PHONE"),
  bootstrapAdminPassword: requireEnv("BOOTSTRAP_ADMIN_PASSWORD"),
  bootstrapAdminResetPassword:
    process.env.BOOTSTRAP_ADMIN_RESET_PASSWORD?.trim().toLowerCase() === "true",

  // Optional: used as fallbacks when the database has no runtime config override.
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "",
  openaiChatModel: process.env.OPENAI_CHAT_MODEL?.trim() || "",
  zhipuaiApiKey: process.env.ZHIPUAI_API_KEY?.trim() || "",
  chatRetrievalTopK: numberEnv("CHAT_RETRIEVAL_TOP_K", 5),
  chatRetrievalScoreThreshold: numberEnv("CHAT_RETRIEVAL_SCORE_THRESHOLD", 0.35),
  chatContextMessageLimit: numberEnv("CHAT_CONTEXT_MESSAGE_LIMIT", 8),
  ingestChunkSize: numberEnv("INGEST_CHUNK_SIZE", 800),
  ingestChunkOverlap: numberEnv("INGEST_CHUNK_OVERLAP", 120),
  embeddingBatchSize: numberEnv("EMBEDDING_BATCH_SIZE", 64),
} as const;
