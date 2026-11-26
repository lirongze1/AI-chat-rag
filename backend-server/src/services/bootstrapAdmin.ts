import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import * as userRepository from "../repositories/user.repository";

const BCRYPT_ROUNDS = 12;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

function maskedPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "****";
}

/**
 * Idempotent first-start administrator bootstrap.
 * Promotes an existing account, and resets its password only when explicitly requested.
 * Passwords are hashed in memory and never logged.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const phone = config.bootstrapAdminPhone.trim();
  if (!PHONE_PATTERN.test(phone)) {
    throw new Error("[bootstrapAdmin] BOOTSTRAP_ADMIN_PHONE must be a valid phone number");
  }

  const existing = await userRepository.findUserByPhone(phone);
  if (!existing) {
    const passwordHash = await bcrypt.hash(config.bootstrapAdminPassword, BCRYPT_ROUNDS);
    await userRepository.createUser({
      id: crypto.randomUUID(),
      phone,
      passwordHash,
      displayName: "系统管理员",
      role: "ADMIN",
    });
    console.log(`[bootstrapAdmin] created administrator ${maskedPhone(phone)}`);
    return;
  }

  if (existing.role !== "ADMIN") {
    await prisma.appUser.update({
      where: { id: existing.id },
      data: { role: "ADMIN" },
    });
    console.log(`[bootstrapAdmin] promoted existing account ${maskedPhone(phone)} to ADMIN`);
  } else {
    console.log(`[bootstrapAdmin] administrator ${maskedPhone(phone)} already exists`);
  }

  if (config.bootstrapAdminResetPassword) {
    const passwordHash = await bcrypt.hash(config.bootstrapAdminPassword, BCRYPT_ROUNDS);
    await prisma.appUser.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    console.log(`[bootstrapAdmin] reset password for ${maskedPhone(phone)} from environment`);
  }
}
