import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

/** Create an account. Callers must hash the password first. */
export async function createUser(data: {
  id: string;
  phone?: string | null;
  email?: string | null;
  passwordHash: string;
  displayName?: string | null;
  role?: UserRole;
}) {
  return prisma.appUser.create({ data });
}

/** Match a phone number exactly, or a legacy email case-insensitively. */
export async function findUserByAccount(account: string) {
  return prisma.appUser.findFirst({
    where: {
      OR: [{ phone: account }, { email: account.toLowerCase() }],
    },
  });
}

/** Look up an account by phone (unique index). */
export async function findUserByPhone(phone: string) {
  return prisma.appUser.findUnique({ where: { phone } });
}

/** Look up an account by the subject of a verified JWT. */
export async function findUserById(userId: string) {
  return prisma.appUser.findUnique({ where: { id: userId } });
}
