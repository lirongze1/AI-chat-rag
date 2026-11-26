import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { sendApiError } from "../common/errors";

const LEGACY_IDENTITY_CLAIMS = ["userId", "browserFingerprintHash"] as const;

/**
 * Detect any client-supplied identity claim that disagrees with the token subject.
 * A matching claim is accepted but never used as the identity source.
 */
function hasConflictingIdentity(source: unknown, authenticatedUserId: string): boolean {
  if (!source || typeof source !== "object") {
    return false;
  }

  const values = source as Record<string, unknown>;
  for (const key of LEGACY_IDENTITY_CLAIMS) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      continue;
    }

    const value = values[key];
    if (Array.isArray(value) || (value !== null && typeof value === "object")) {
      return true;
    }
    if (typeof value !== "string" || value.trim() !== authenticatedUserId) {
      return true;
    }
  }

  return false;
}

/** Verify Bearer JWT, attach req.userId, and reject spoofed identity claims. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return sendApiError(res, 401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  try {
    const decoded = jwt.verify(match[1].trim(), config.jwtSecret);
    const userId =
      decoded && typeof decoded === "object" && typeof decoded.sub === "string" ? decoded.sub : "";

    if (!userId) {
      return sendApiError(res, 401, "UNAUTHORIZED", "Invalid token subject");
    }

    if (
      hasConflictingIdentity(req.body, userId) ||
      hasConflictingIdentity(req.query, userId)
    ) {
      return sendApiError(
        res,
        403,
        "USER_ID_MISMATCH",
        "Request identity does not match the authenticated user",
      );
    }

    req.userId = userId;
    return next();
  } catch {
    return sendApiError(res, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
