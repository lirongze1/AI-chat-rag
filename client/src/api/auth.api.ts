import { requestApi } from "./httpClient";

export type UserRole = "ADMIN" | "USER";

export type AuthUser = {
  userId: string;
  phone: string;
  email?: string | null;
  displayName?: string | null;
  role: UserRole;
  isActive: boolean;
};

export type AuthResult = AuthUser & {
  token: string;
};

export type Credentials = {
  account: string;
  password: string;
};

/** 手机号密码登录（公开接口，不注入 Authorization）。 */
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
