import crypto from "node:crypto";
import { config } from "../config";

// 32-byte AES key derived from JWT_SECRET; no secret is ever hard-coded here.
const encryptionKey = crypto.createHash("sha256").update(config.jwtSecret).digest();
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1";

/** Encrypt an API key into a self-describing `v1:iv:tag:ciphertext` string. */
export function encryptSecret(plain: string): string {
  if (!plain) {
    return "";
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a stored API key. Plaintext values (legacy or environment fallbacks)
 * are returned unchanged so old data keeps working.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) {
    return "";
  }

  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    return stored;
  }

  try {
    const [, ivBase64, tagBase64, encryptedBase64] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(ivBase64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("[secretCrypto] failed to decrypt stored secret", error);
    return "";
  }
}
