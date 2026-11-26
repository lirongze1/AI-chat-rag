import { Navigate, Route, Routes } from "react-router-dom";
import { IngestionEventProvider } from "./components/knowledge-base/IngestionEventProvider";
import AppShellLayout from "./components/layout/AppShellLayout";
import { AuthProvider } from "./context/AuthContext";
import ChatPage from "./routes/ChatPage";
import KnowledgeBasePage from "./routes/KnowledgeBasePage";
import KnowledgeFileDetailPage from "./routes/KnowledgeFileDetailPage";
import LoginPage from "./routes/LoginPage";
import ProtectedRoute from "./routes/ProtectedRoute";

const App = () => {
  return (
    <AuthProvider>
      <IngestionEventProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShellLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="/knowledge-base/files/:fileId" element={<KnowledgeFileDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </IngestionEventProvider>
    </AuthProvider>
  );
};

export default App;
