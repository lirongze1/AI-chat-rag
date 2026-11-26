const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/v1";

export const AUTH_TOKEN_KEY = "ai_chat_rag_token";

/** 读取当前登录令牌。 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** 保存登录令牌。 */
export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/** 退出登录时清除令牌。 */
export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** 令牌失效时跳转到登录页；登录页自身无需跳转。 */
export function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") {
    return;
  }
  window.location.assign("/login");
}

export function createApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

/** 为任意请求追加统一 Authorization 头。 */
export function createAuthHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const token = getAuthToken();
  if (token) {
    result.set("Authorization", `Bearer ${token}`);
  }
  return result;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

export type RequestOptions = {
  /** 登录/注册接口传 false，避免携带令牌或因 401 自动跳转。 */
  auth?: boolean;
};

/**
 * 统一封装前端 API 请求，并解析后端标准 data/error 包装结构。
 * 自动注入 Bearer Token；遇到 401 时清除令牌并跳转登录页。
 */
export async function requestApi<T>(
  path: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const useAuth = options?.auth !== false;
  const headers = useAuth ? createAuthHeaders(init?.headers) : new Headers(init?.headers);
  const response = await fetch(createApiUrl(path), { ...init, headers });

  if (response.status === 401 && useAuth) {
    clearAuthToken();
    redirectToLogin();
    throw new ApiError("登录已过期，请重新登录", 401);
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // 后端可能返回空响应体，统一在下方的状态/结构检查中报错。
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || `HTTP ${response.status}`,
      response.status,
      payload?.error?.code,
    );
  }

  // 不能用 !payload.data：合法的 0 / false / null 会被误判为无效响应。
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "data")) {
    throw new ApiError("Invalid API response", response.status);
  }

  return payload.data as T;
}
