import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuthToken } from "../api/httpClient";
import { useAuth } from "../context/AuthContext";

type ProtectedRouteProps = PropsWithChildren<{ adminOnly?: boolean }>;

/**
 * 未登录访问受保护页面时跳转到 /login 并记录原始目标；
 * adminOnly 页面仅允许 ADMIN 访问，其余角色重定向到 /chat。
 */
const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, isLoading } = useAuth();

  if (!getAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly) {
    if (isLoading) {
      return null;
    }
    if (user?.role !== "ADMIN") {
      return <Navigate to="/chat" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
