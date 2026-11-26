import type { NextFunction, Request, Response } from "express";
import { createApiError } from "../common/errors";
import {
  chunkUploadBodySchema,
  chunkUploadCompleteBodySchema,
  ingestionChunkSyncBodySchema,
  chunkUploadInitBodySchema,
  chunkUploadStatusQuerySchema,
  fileParamsSchema,
  fileDetailQuerySchema,
  filePrecheckBodySchema,
  filesQuerySchema,
  ingestionCallbackBodySchema,
  taskParamsSchema,
} from "../common/schemas";
import { validate } from "../common/validation";
import * as fileService from "../services/file.service";

/** Return the authenticated account; kept for clients that used the old identify endpoint. */
export async function identifyCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: { id: req.userId } });
  } catch (error) {
    next(error);
  }
}

export async function precheckFileUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(filePrecheckBodySchema, req.body || {}, "request body");
    const result = await fileService.precheckFileUpload({
      userId: req.userId,
      contentMd5: payload.contentMd5,
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw createApiError(400, "VALIDATION_ERROR", "Invalid request body", [
        { path: "file", message: "Required" },
      ]);
    }

    const result = await fileService.uploadFile({
      userId: req.userId,
      file: req.file,
    });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function initChunkUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(chunkUploadInitBodySchema, req.body || {}, "request body");
    const result = await fileService.initChunkUpload({
      uploadId: payload.uploadId,
      userId: req.userId,
      fileName: payload.fileName,
      fileSizeBytes: payload.fileSizeBytes,
      totalChunks: payload.totalChunks,
    });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadChunk(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(chunkUploadBodySchema, req.body || {}, "request body");
    if (!req.file) {
      throw createApiError(400, "VALIDATION_ERROR", "Invalid request body", [
        { path: "file", message: "Required" },
      ]);
    }

    const result = await fileService.uploadChunk({
      uploadId: payload.uploadId,
      userId: req.userId,
      chunkIndex: payload.chunkIndex,
      file: req.file,
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getChunkUploadStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { uploadId } = validate(chunkUploadStatusQuerySchema, req.query || {}, "query params");
    const result = await fileService.getChunkUploadStatus(req.userId, uploadId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function completeChunkUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(chunkUploadCompleteBodySchema, req.body || {}, "request body");
    const result = await fileService.completeChunkUpload(req.userId, payload.uploadId);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(filesQuerySchema, req.query || {}, "query params");
    const files = await fileService.getFiles({
      userId: req.userId,
      parseStatus: query.parseStatus,
      page: query.page,
      limit: query.limit,
    });
    res.json({ data: files });
  } catch (error) {
    next(error);
  }
}

export async function getFileDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileId } = validate(fileParamsSchema, req.params || {}, "path params");
    const query = validate(fileDetailQuerySchema, req.query || {}, "query params");
    const file = await fileService.getFileDetail({
      userId: req.userId,
      fileId,
      page: query.page,
      limit: query.limit,
    });
    res.json({ data: file });
  } catch (error) {
    next(error);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { taskId } = validate(taskParamsSchema, req.params || {}, "path params");
    const task = await fileService.getTask(req.userId, taskId);
    res.json({ data: task });
  } catch (error) {
    next(error);
  }
}

export async function dispatchPendingFileIngestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileId } = validate(fileParamsSchema, req.params || {}, "path params");
    const result = await fileService.dispatchPendingFileIngestion({ userId: req.userId, fileId });
    res.status(202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function offloadIndexedFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileId } = validate(fileParamsSchema, req.params || {}, "path params");
    const result = await fileService.offloadIndexedFile({ userId: req.userId, fileId });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteKnowledgeFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileId } = validate(fileParamsSchema, req.params || {}, "path params");
    const result = await fileService.deleteKnowledgeFile({ userId: req.userId, fileId });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

/** Signed service-to-service callback; identity is not taken from the request body. */
export async function ingestionCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(ingestionCallbackBodySchema, req.body || {}, "request body");
    const result = await fileService.handleIngestionCallback(payload);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function syncIngestionChunks(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(ingestionChunkSyncBodySchema, req.body || {}, "request body");
    const result = await fileService.syncIngestionChunks(payload);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function streamFileEvents(req: Request, res: Response, next: NextFunction) {
  try {
    fileService.streamFileEvents(req.userId, res);
  } catch (error) {
    next(error);
  }
}
