import { requestApi } from "./httpClient";
import type { UserRole } from "./auth.api";

/** 管理端用户资料，createdAt 为 ISO 时间字符串。 */
export type AdminUser = {
  userId: string;
  phone: string;
  email?: string | null;
  displayName?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
};

export type AdminUserList = {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
};

export type CreateAdminUserPayload = {
  phone: string;
  password: string;
  displayName?: string;
  role?: UserRole;
};

export type UpdateAdminUserPayload = {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
};

export type ResetPasswordPayload = {
  newPassword: string;
};

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 后端可能返回字符串数字，提交前统一用 Number() 转换。 */
  temperature: number | string;
};

export type EmbeddingConfig = {
  provider: "zhipu" | "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type RetrievalConfig = {
  topK: number | string;
  scoreThreshold: number | string;
  contextMessageLimit: number | string;
};

export type ChunkConfig = {
  chunkSize: number | string;
  chunkOverlap: number | string;
  embeddingBatchSize: number | string;
};

export type AdminConfig = {
  llm: LlmConfig;
  embedding: EmbeddingConfig;
  retrieval: RetrievalConfig;
  chunk: ChunkConfig;
  configured: {
    llm: boolean;
    embedding: boolean;
  };
};

/**
 * 保存配置时 apiKey 的语义：
 * - ""：保持原值（输入框留空）
 * - null：清空密钥
 * - 新字符串：更新密钥
 */
type ApiKeyInput = string | null;

export type AdminConfigPayload = Omit<AdminConfig, "llm" | "embedding" | "configured"> & {
  llm: Omit<LlmConfig, "apiKey"> & { apiKey: ApiKeyInput };
  embedding: Omit<EmbeddingConfig, "apiKey"> & { apiKey: ApiKeyInput };
};

export type ConfigTestKind = "llm" | "embedding";

export type ConfigTestResult = {
  reachable: boolean;
  message: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

/** 分页获取用户列表。 */
export function getAdminUsers(page = 1, limit = 10) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return requestApi<AdminUserList>(`/admin/users?${query.toString()}`);
}

/** 新建用户（管理员创建，无需公开注册）。 */
export function createAdminUser(payload: CreateAdminUserPayload) {
  return requestApi<AdminUser>("/admin/users", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

/** 修改用户姓名 / 角色 / 启用状态。 */
export function updateAdminUser(userId: string, payload: UpdateAdminUserPayload) {
  return requestApi<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

/** 重置用户密码。 */
export function resetAdminUserPassword(userId: string, payload: ResetPasswordPayload) {
  return requestApi<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

/** 删除（软删 / 禁用）用户。 */
export function deleteAdminUser(userId: string) {
  return requestApi<Record<string, unknown>>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/** 读取脱敏后的模型配置。 */
export function getAdminConfig() {
  return requestApi<AdminConfig>("/admin/config");
}

/** 保存完整配置，返回脱敏后的配置。 */
export function updateAdminConfig(payload: AdminConfigPayload) {
  return requestApi<AdminConfig>("/admin/config", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

/** 测试 LLM 或 Embedding 连接。 */
export function testAdminConfig(kind: ConfigTestKind) {
  return requestApi<ConfigTestResult>("/admin/config/test", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ kind }),
  });
}
