import { prisma } from "../lib/prisma";

/** Create an email/password account. Callers must hash the password first. */
export async function createUser(data: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
}) {
  return prisma.appUser.create({ data });
}

/** Look up an account by normalized email. */
export async function findUserByEmail(email: string) {
  return prisma.appUser.findUnique({ where: { email } });
}

/** Look up an account by the subject of a verified JWT. */
export async function findUserById(userId: string) {
  return prisma.appUser.findUnique({ where: { id: userId } });
}
