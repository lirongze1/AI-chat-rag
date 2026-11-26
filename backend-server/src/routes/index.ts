import { Router } from "express";
import * as chatController from "../controllers/chat.controller";
import * as fileController from "../controllers/file.controller";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import adminRouter from "./admin.routes";
import aiRouter from "./ai.routes";
import authRouter from "./auth.routes";
import ingestionRouter from "./ingestion.routes";

const router = Router();

// Public routes: account access and signed AI service callbacks.
router.use("/auth", authRouter);
router.use("/ai/ingestion", ingestionRouter);

// Admin routes enforce auth + admin role themselves (mounted before the global guard).
router.use("/admin", adminRouter);

// Every remaining /v1 route requires a valid Bearer token.
router.use(requireAuth);

// Current account bootstrap (kept for existing clients; identity comes from the token).
router.post("/users/identify", fileController.identifyCurrentUser);

// Upload route requires multipart field `file`.
router.post("/files/precheck", fileController.precheckFileUpload);
router.post("/files/upload", upload.single("file"), fileController.uploadFile);
router.post("/files/upload/chunked/init", fileController.initChunkUpload);
router.post("/files/upload/chunked/chunk", upload.single("file"), fileController.uploadChunk);
router.get("/files/upload/chunked/status", fileController.getChunkUploadStatus);
router.post("/files/upload/chunked/complete", fileController.completeChunkUpload);
router.get("/files", fileController.getFiles);
router.get("/files/:fileId/detail", fileController.getFileDetail);
router.post("/files/:fileId/ingest", fileController.dispatchPendingFileIngestion);
router.post("/files/:fileId/offload", fileController.offloadIndexedFile);
router.delete("/files/:fileId", fileController.deleteKnowledgeFile);
router.get("/files/events", fileController.streamFileEvents);
router.get("/tasks/:taskId", fileController.getTask);

// Chat routes map session and message operations.
router.post("/chat/sessions", chatController.createSession);
router.get("/chat/sessions", chatController.getSessions);
router.delete("/chat/sessions", chatController.deleteSessions);
router.post("/chat/sessions/:id/messages", chatController.createMessage);
router.get("/chat/sessions/:id/messages", chatController.getMessages);
router.delete("/chat/sessions/:id", chatController.deleteSession);
router.post("/chat/sessions/:id/completions", chatController.completeSessionChat);

// AI proxy routes are isolated for future Python service evolution.
router.use("/ai", aiRouter);

export default router;
