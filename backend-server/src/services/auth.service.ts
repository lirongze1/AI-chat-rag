import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApiError } from "../common/errors";
import { config } from "../config";
import * as userRepository from "../repositories/user.repository";

const BCRYPT_ROUNDS = 12;

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
};

function toAuthUser(user: { id: string; email: string; displayName: string | null }): AuthUser {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName || user.email.split("@")[0],
  };
}

function signToken(user: AuthUser): string {
  const options: jwt.SignOptions = {
    subject: user.userId,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign({ email: user.email }, config.jwtSecret, options);
}

export async function register(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser & { token: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await userRepository.findUserByEmail(email);
  if (existing) {
    throw createApiError(409, "EMAIL_ALREADY_EXISTS", "Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const displayName = input.displayName?.trim() || email.split("@")[0];
  const user = await userRepository.createUser({
    id: crypto.randomUUID(),
    email,
    passwordHash,
    displayName,
  });

  const authUser = toAuthUser(user);
  return { ...authUser, token: signToken(authUser) };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthUser & { token: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await userRepository.findUserByEmail(email);

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw createApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const authUser = toAuthUser(user);
  return { ...authUser, token: signToken(authUser) };
}

export async function getAuthenticatedUser(userId: string): Promise<AuthUser> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw createApiError(401, "UNAUTHORIZED", "Authenticated user no longer exists");
  }
  return toAuthUser(user);
}
