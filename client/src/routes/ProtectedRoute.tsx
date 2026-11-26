import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuthToken } from "../api/httpClient";

/** 未登录访问受保护页面时跳转到 /login，并记录原始目标路径。 */
const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const location = useLocation();

  if (!getAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
