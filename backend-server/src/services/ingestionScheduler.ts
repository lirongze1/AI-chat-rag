import path from "node:path";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import * as aiService from "./ai.service";

type IngestionTaskRecord = {
  id: string;
  fileId: string;
  userId: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  progress: number;
  attemptCount: number;
};

let started = false;

/**
 * Build the AI dispatch payload from persisted file/task records.
 * The absolute path is derived from storagePath so a restarted process can resume.
 */
async function buildDispatchPayload(task: IngestionTaskRecord) {
  const file = await prisma.knowledgeFile.findUnique({ where: { id: task.fileId } });
  if (!file) {
    return null;
  }

  return {
    taskId: task.id,
    fileId: file.id,
    userId: file.userId,
    fileName: file.fileName,
    fileExt: path.extname(file.fileName || "") || ".bin",
    fileSizeBytes: file.fileSizeBytes,
    contentMd5: file.contentMd5 || "",
    storagePath: file.storagePath,
    absoluteFilePath: path.resolve(process.cwd(), file.storagePath),
    parseVersion: file.parseVersion,
  };
}

/** Persist failure details and schedule the next attempt with exponential backoff. */
async function recordDispatchFailure(task: IngestionTaskRecord, error: unknown) {
  const attemptCount = task.attemptCount + 1;
  const message = error instanceof Error ? error.message : "Unknown ingestion dispatch error";

  if (attemptCount >= config.ingestionMaxAttempts) {
    await prisma.ingestionTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        attemptCount,
        errorMessage: `Dispatch failed after ${attemptCount} attempts: ${message}`,
        nextRetryAt: null,
      },
    });
    await prisma.knowledgeFile.update({
      where: { id: task.fileId },
      data: { parseStatus: "failed" },
    });
    console.error(`[ingestionScheduler] task ${task.id} exhausted retries`, error);
    return;
  }

  const delayMs = Math.min(
    config.ingestionRetryBaseMs * 2 ** (attemptCount - 1),
    config.ingestionRetryMaxMs,
  );

  await prisma.ingestionTask.update({
    where: { id: task.id },
    data: {
      status: "queued",
      attemptCount,
      errorMessage: message,
      nextRetryAt: new Date(Date.now() + delayMs),
    },
  });

  console.error(
    `[ingestionScheduler] task ${task.id} dispatch failed (attempt ${attemptCount}); retry in ${delayMs}ms`,
    error,
  );
}

/**
 * Dispatch one queued/stale task. Failures are recorded in DB and retried later.
 */
export async function dispatchTask(taskId: string): Promise<void> {
  const task = await prisma.ingestionTask.findUnique({ where: { id: taskId } });
  if (!task || (task.status !== "queued" && task.status !== "running")) {
    return;
  }
  if (task.nextRetryAt && task.nextRetryAt.getTime() > Date.now()) {
    return;
  }

  const payload = await buildDispatchPayload(task);
  if (!payload) {
    await prisma.ingestionTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        errorMessage: "Knowledge file not found for ingestion task",
        nextRetryAt: null,
      },
    });
    console.error(`[ingestionScheduler] task ${taskId} has no matching knowledge file`);
    return;
  }

  try {
    await aiService.dispatchIngestionTask(payload);
    await prisma.ingestionTask.update({
      where: { id: taskId },
      data: {
        status: "running",
        progress: Math.max(task.progress, 10),
        errorMessage: null,
        attemptCount: task.attemptCount + 1,
        nextRetryAt: null,
      },
    });
  } catch (error) {
    await recordDispatchFailure(task, error);
  }
}

/** Non-blocking trigger used by request handlers after a task is queued. */
export function requestDispatch(taskId: string): void {
  void dispatchTask(taskId).catch((error) => {
    console.error(`[ingestionScheduler] unexpected error for task ${taskId}`, error);
  });
}

/**
 * Re-dispatch every due queued task and every running task that stopped progressing.
 */
export async function recoverPendingTasks(): Promise<void> {
  const now = new Date();
  const staleBefore = new Date(Date.now() - config.ingestionRunningTimeoutMs);

  const tasks = await prisma.ingestionTask.findMany({
    where: {
      OR: [
        {
          status: "queued",
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        { status: "running", updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  for (const task of tasks) {
    if (task.status === "running") {
      await prisma.ingestionTask.update({
        where: { id: task.id },
        data: {
          status: "queued",
          attemptCount: task.attemptCount + 1,
          errorMessage: "Recovered stale running task",
          nextRetryAt: null,
        },
      });
    }

    await dispatchTask(task.id);
  }
}

/** Start recovery immediately and keep polling for retry-due tasks. */
export async function startIngestionScheduler(): Promise<void> {
  if (started) {
    return;
  }
  started = true;

  await recoverPendingTasks();

  const timer = setInterval(() => {
    void recoverPendingTasks().catch((error) => {
      console.error("[ingestionScheduler] recovery poll failed", error);
    });
  }, config.ingestionPollIntervalMs);
  timer.unref?.();
}
