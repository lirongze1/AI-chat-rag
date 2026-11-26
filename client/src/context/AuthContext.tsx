import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  getCurrentUser,
  loginWithPassword,
  type AuthUser,
} from "../api/auth.api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../api/httpClient";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** 有令牌时通过 /auth/me 恢复用户资料；失效时交给 httpClient 清理并跳转。 */
  const refreshUser = useCallback(async () => {
    if (!getAuthToken()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      setUser(await getCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (account: string, password: string) => {
    const result = await loginWithPassword({ account, password });
    setAuthToken(result.token);
    setUser({
      userId: result.userId,
      phone: result.phone,
      email: result.email,
      displayName: result.displayName,
      role: result.role,
      isActive: result.isActive,
    });
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    login,
    logout,
    refreshUser,
  }), [user, isLoading, login, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
