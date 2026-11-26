import { requestApi } from "./httpClient";

export type AuthUser = {
  userId: string;
  email: string;
  displayName?: string | null;
};

export type AuthResult = AuthUser & {
  token: string;
};

export type Credentials = {
  email: string;
  password: string;
};

/** 注册新用户（公开接口，不注入 Authorization）。 */
export function registerAccount(payload: Credentials & { displayName?: string }) {
  return requestApi<AuthResult>(
    "/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { auth: false },
  );
}

/** 邮箱密码登录（公开接口，不注入 Authorization）。 */
export function loginWithPassword(payload: Credentials) {
  return requestApi<AuthResult>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { auth: false },
  );
}

/** 获取当前登录用户资料。 */
export function getCurrentUser() {
  return requestApi<AuthUser>("/auth/me");
}
