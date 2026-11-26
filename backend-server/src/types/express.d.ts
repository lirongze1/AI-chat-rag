import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Authenticated user ID set by requireAuth from the verified JWT subject. */
    userId: string;
    /** Exact JSON payload captured by express.json verify, used for HMAC validation. */
    rawBody?: string;
  }
}
