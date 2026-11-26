import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { createApiError } from "../common/errors";
import { appConfigBodySchema } from "../common/schemas";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { decryptSecret, encryptSecret } from "./secretCrypto";

type AppConfigBody = z.infer<typeof appConfigBodySchema>;

export type AppConfigData = {
  llm: { apiKey: string; baseUrl: string; model: string; temperature: number };
  embedding: { provider: string; apiKey: string; model: string; baseUrl: string };
  retrieval: { topK: number; scoreThreshold: number; contextMessageLimit: number };
  chunk: { chunkSize: number; chunkOverlap: number; embeddingBatchSize: number };
};

export type MaskedConfig = AppConfigData & {
  configured: { llm: boolean; embedding: boolean };
};

const CACHE_TTL_MS = 30_000;
const CONFIG_ID = "default";

let cached: { value: AppConfigData; expiresAt: number } | null = null;

/** Environment-backed defaults used whenever a stored field is empty or the DB is down. */
function envDefaults(): AppConfigData {
  return {
    llm: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiChatModel || "qwen-plus",
      temperature: 0.2,
    },
    embedding: {
      provider: "zhipu",
      apiKey: config.zhipuaiApiKey,
      model: "embedding-3",
      baseUrl: "",
    },
    retrieval: {
      topK: config.chatRetrievalTopK,
      scoreThreshold: config.chatRetrievalScoreThreshold,
      contextMessageLimit: config.chatContextMessageLimit,
    },
    chunk: {
      chunkSize: config.ingestChunkSize,
      chunkOverlap: config.ingestChunkOverlap,
      embeddingBatchSize: config.embeddingBatchSize,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numOr(value: unknown, fallback: number, min = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;
}

function resolvedSecret(storedValue: unknown, fallback: string): string {
  const raw = str(storedValue);
  return (raw ? decryptSecret(raw) : "") || fallback;
}

function mergeAndDecrypt(stored: unknown): AppConfigData {
  const defaults = envDefaults();
  const raw = asRecord(stored);
  const llm = asRecord(raw.llm);
  const embedding = asRecord(raw.embedding);
  const retrieval = asRecord(raw.retrieval);
  const chunk = asRecord(raw.chunk);

  return {
    llm: {
      apiKey: resolvedSecret(llm.apiKey, defaults.llm.apiKey),
      baseUrl: str(llm.baseUrl) || defaults.llm.baseUrl,
      model: str(llm.model) || defaults.llm.model,
      temperature: numOr(llm.temperature, defaults.llm.temperature),
    },
    embedding: {
      provider: str(embedding.provider) || defaults.embedding.provider,
      apiKey: resolvedSecret(embedding.apiKey, defaults.embedding.apiKey),
      model: str(embedding.model) || defaults.embedding.model,
      baseUrl: str(embedding.baseUrl) || defaults.embedding.baseUrl,
    },
    retrieval: {
      topK: numOr(retrieval.topK, defaults.retrieval.topK, 1),
      scoreThreshold: numOr(retrieval.scoreThreshold, defaults.retrieval.scoreThreshold),
      contextMessageLimit: numOr(
        retrieval.contextMessageLimit,
        defaults.retrieval.contextMessageLimit,
        1,
      ),
    },
    chunk: {
      chunkSize: numOr(chunk.chunkSize, defaults.chunk.chunkSize, 1),
      chunkOverlap: numOr(chunk.chunkOverlap, defaults.chunk.chunkOverlap),
      embeddingBatchSize: numOr(chunk.embeddingBatchSize, defaults.chunk.embeddingBatchSize, 1),
    },
  };
}

async function loadConfig(): Promise<AppConfigData> {
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: CONFIG_ID } });
    return row ? mergeAndDecrypt(row.data) : envDefaults();
  } catch (error) {
    // A missing/unreachable config table must never break chat requests.
    console.warn(
      "[runtimeConfig] database unavailable, falling back to environment defaults",
      error instanceof Error ? error.message : error,
    );
    return envDefaults();
  }
}

/** Return the effective config with decrypted API keys, cached for 30 seconds. */
export async function getDecryptedConfig(): Promise<AppConfigData> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loadConfig();
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function invalidateConfigCache(): void {
  cached = null;
}

function maskApiKey(value: string): string {
  if (!value) {
    return "";
  }
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

export function toMaskedConfig(value: AppConfigData): MaskedConfig {
  return {
    llm: { ...value.llm, apiKey: maskApiKey(value.llm.apiKey) },
    embedding: { ...value.embedding, apiKey: maskApiKey(value.embedding.apiKey) },
    retrieval: { ...value.retrieval },
    chunk: { ...value.chunk },
    configured: {
      llm: Boolean(value.llm.apiKey),
      embedding: Boolean(value.embedding.apiKey),
    },
  };
}

export async function getMaskedConfig(): Promise<MaskedConfig> {
  return toMaskedConfig(await getDecryptedConfig());
}

/**
 * Merge a full config payload into AppConfig. An empty apiKey keeps the current
 * value, null clears it, and any other string is encrypted before storage.
 */
export async function saveConfig(input: AppConfigBody, updatedBy: string): Promise<MaskedConfig> {
  const current = await getDecryptedConfig();

  const resolveKey = (incoming: string | null | undefined, existing: string): string => {
    if (incoming === undefined || incoming === "") {
      return existing;
    }
    if (incoming === null) {
      return "";
    }
    return incoming;
  };

  const next: AppConfigData = {
    llm: {
      apiKey: resolveKey(input.llm.apiKey, current.llm.apiKey),
      baseUrl: input.llm.baseUrl ?? current.llm.baseUrl,
      model: input.llm.model ?? current.llm.model,
      temperature: input.llm.temperature ?? current.llm.temperature,
    },
    embedding: {
      provider: input.embedding.provider ?? current.embedding.provider,
      apiKey: resolveKey(input.embedding.apiKey, current.embedding.apiKey),
      model: input.embedding.model ?? current.embedding.model,
      baseUrl: input.embedding.baseUrl ?? current.embedding.baseUrl,
    },
    retrieval: {
      topK: input.retrieval.topK ?? current.retrieval.topK,
      scoreThreshold: input.retrieval.scoreThreshold ?? current.retrieval.scoreThreshold,
      contextMessageLimit:
        input.retrieval.contextMessageLimit ?? current.retrieval.contextMessageLimit,
    },
    chunk: {
      chunkSize: input.chunk.chunkSize ?? current.chunk.chunkSize,
      chunkOverlap: input.chunk.chunkOverlap ?? current.chunk.chunkOverlap,
      embeddingBatchSize: input.chunk.embeddingBatchSize ?? current.chunk.embeddingBatchSize,
    },
  };

  const toStore = {
    ...next,
    llm: { ...next.llm, apiKey: encryptSecret(next.llm.apiKey) },
    embedding: { ...next.embedding, apiKey: encryptSecret(next.embedding.apiKey) },
  };

  await prisma.appConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      data: toStore as Prisma.InputJsonValue,
      updatedBy,
    },
    update: {
      data: toStore as Prisma.InputJsonValue,
      updatedBy,
    },
  });

  invalidateConfigCache();
  return toMaskedConfig(next);
}

export type ConfigTestResult = {
  reachable: boolean;
  message: string;
  /** This is a lightweight probe (GET {baseUrl}/models), not a full inference call. */
  simplified: true;
};

/** Lightweight connectivity probe using the currently effective config. */
export async function testConfigConnection(kind: "llm" | "embedding"): Promise<ConfigTestResult> {
  const current = await getDecryptedConfig();
  const target = kind === "llm" ? current.llm : current.embedding;
  const label = kind === "llm" ? "LLM" : "Embedding";

  if (!target.apiKey) {
    return {
      reachable: false,
      message: `${label} apiKey 未配置，无法探测（简化探测）`,
      simplified: true,
    };
  }
  if (!target.baseUrl) {
    return {
      reachable: false,
      message: `${label} baseUrl 未配置，跳过网络探测（简化探测）`,
      simplified: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${target.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${target.apiKey}` },
      signal: controller.signal,
    });
    return {
      reachable: response.ok,
      message: response.ok
        ? `${label} 连通性探测成功（简化探测：GET /models）`
        : `${label} 探测返回 HTTP ${response.status}（简化探测）`,
      simplified: true,
    };
  } catch (error) {
    throw createApiError(
      502,
      "CONFIG_TEST_FAILED",
      `${label} 连通性探测失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
