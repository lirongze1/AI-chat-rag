import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createApiError } from "../common/errors";
import { prisma } from "../lib/prisma";
import * as userRepository from "../repositories/user.repository";

const BCRYPT_ROUNDS = 12;

type UserDto = {
  userId: string;
  phone: string | null;
  email: string | null;
  displayName: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  createdAt: Date;
};

function toDto(user: {
  id: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
  role: "ADMIN" | "USER";
  isActive: boolean;
  createdAt: Date;
}): UserDto {
  return {
    userId: user.id,
    phone: user.phone,
    email: user.email,
    displayName: user.displayName?.trim() || user.phone || user.email?.split("@")[0] || "User",
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

/** Never allow the last active administrator to be demoted, disabled or deleted. */
async function ensureOtherActiveAdminExists(excludeUserId: string): Promise<void> {
  const otherAdmins = await prisma.appUser.count({
    where: { role: "ADMIN", isActive: true, id: { not: excludeUserId } },
  });
  if (otherAdmins === 0) {
    throw createApiError(
      409,
      "LAST_ADMIN_PROTECTED",
      "Cannot demote, disable or delete the last active administrator",
    );
  }
}

export async function listUsers(query: { page: number; limit: number }) {
  const [items, total] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.appUser.count(),
  ]);

  return {
    items: items.map(toDto),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function createUser(input: {
  phone: string;
  password: string;
  displayName?: string;
  role?: "ADMIN" | "USER";
}): Promise<UserDto> {
  const existing = await userRepository.findUserByPhone(input.phone);
  if (existing) {
    throw createApiError(409, "PHONE_ALREADY_EXISTS", "Phone number already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const user = await prisma.appUser.create({
      data: {
        id: crypto.randomUUID(),
        phone: input.phone,
        passwordHash,
        displayName: input.displayName?.trim() || null,
        role: input.role ?? "USER",
      },
    });
    return toDto(user);
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw createApiError(409, "PHONE_ALREADY_EXISTS", "Phone number already exists");
    }
    throw error;
  }
}

export async function updateUser(
  userId: string,
  input: { displayName?: string; role?: "ADMIN" | "USER"; isActive?: boolean },
): Promise<UserDto> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw createApiError(404, "USER_NOT_FOUND", "User not found");
  }

  const nextRole = input.role ?? user.role;
  const nextActive = input.isActive ?? user.isActive;
  if (user.role === "ADMIN" && (nextRole !== "ADMIN" || !nextActive)) {
    await ensureOtherActiveAdminExists(userId);
  }

  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      role: nextRole,
      isActive: nextActive,
    },
  });
  return toDto(updated);
}

export async function resetPassword(userId: string, newPassword: string): Promise<UserDto> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw createApiError(404, "USER_NOT_FOUND", "User not found");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return toDto(updated);
}

/** Soft deletion: keep all historical rows, only flip isActive to false. */
export async function softDeleteUser(userId: string): Promise<UserDto> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw createApiError(404, "USER_NOT_FOUND", "User not found");
  }
  if (user.role === "ADMIN" && user.isActive) {
    await ensureOtherActiveAdminExists(userId);
  }

  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: { isActive: false },
  });
  return toDto(updated);
}
