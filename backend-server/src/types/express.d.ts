import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Authenticated user ID set by requireAuth from the verified JWT subject. */
    userId: string;
    /** Role of the authenticated user, re-read from the database on every request. */
    userRole: "ADMIN" | "USER";
    /** Exact JSON payload captured by express.json verify, used for HMAC validation. */
    rawBody?: string;
  }
}
