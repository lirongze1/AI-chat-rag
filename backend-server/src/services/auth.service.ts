import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApiError } from "../common/errors";
import { config } from "../config";
import * as userRepository from "../repositories/user.repository";

export type AuthUser = {
  userId: string;
  phone: string | null;
  email: string | null;
  displayName: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
};

function toAuthUser(user: {
  id: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
  role: "ADMIN" | "USER";
  isActive: boolean;
}): AuthUser {
  return {
    userId: user.id,
    phone: user.phone,
    email: user.email,
    displayName:
      user.displayName?.trim() ||
      (user.phone ? user.phone : user.email?.split("@")[0] || "User"),
    role: user.role,
    isActive: user.isActive,
  };
}

function signToken(user: AuthUser): string {
  const options: jwt.SignOptions = {
    subject: user.userId,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign({ email: user.email }, config.jwtSecret, options);
}

/**
 * Phone (or legacy email) + password login. Public registration is disabled.
 */
export async function login(input: {
  account: string;
  password: string;
}): Promise<AuthUser & { token: string }> {
  const account = input.account.trim();
  const user = await userRepository.findUserByAccount(account);

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw createApiError(401, "INVALID_CREDENTIALS", "Invalid account or password");
  }
  if (!user.isActive) {
    throw createApiError(401, "ACCOUNT_DISABLED", "Account is disabled");
  }

  const authUser = toAuthUser(user);
  return { ...authUser, token: signToken(authUser) };
}

export async function getAuthenticatedUser(userId: string): Promise<AuthUser> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw createApiError(401, "UNAUTHORIZED", "Authenticated user no longer exists");
  }
  if (!user.isActive) {
    throw createApiError(401, "ACCOUNT_DISABLED", "Account is disabled");
  }
  return toAuthUser(user);
}
