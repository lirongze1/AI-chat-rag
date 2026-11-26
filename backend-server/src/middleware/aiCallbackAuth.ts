import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { sendApiError } from "../common/errors";

const MAX_TIMESTAMP_SKEW_SECONDS = 300;

/** Constant-time comparison that is safe when the two strings have different lengths. */
function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Authenticate service-to-service callbacks:
 * - x-ai-service-secret must match the configured secret (constant-time).
 * - x-ai-timestamp must be within five minutes of server time.
 * - x-ai-signature must equal HMAC_SHA256(secret, `${timestamp}.${rawBody}`) as hex.
 */
export function requireAiCallback(req: Request, res: Response, next: NextFunction) {
  const providedSecret = req.header("x-ai-service-secret") || "";
  if (!timingSafeEqualText(providedSecret, config.aiServiceSharedSecret)) {
    return sendApiError(res, 401, "UNAUTHORIZED_AI_CALLBACK", "Invalid AI service secret");
  }

  const timestamp = req.header("x-ai-timestamp") || "";
  const signature = req.header("x-ai-signature") || "";
  const rawBody = req.rawBody;

  if (!/^\d+$/.test(timestamp) || !signature || typeof rawBody !== "string") {
    return sendApiError(res, 401, "UNAUTHORIZED_AI_CALLBACK", "Invalid callback signature headers");
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS
  ) {
    return sendApiError(res, 401, "UNAUTHORIZED_AI_CALLBACK", "Callback timestamp expired");
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.aiServiceSharedSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  if (!timingSafeEqualText(signature.toLowerCase(), expectedSignature)) {
    return sendApiError(res, 401, "UNAUTHORIZED_AI_CALLBACK", "Invalid callback signature");
  }

  return next();
}
