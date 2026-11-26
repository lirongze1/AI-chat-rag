import type { NextFunction, Request, Response } from "express";
import { loginBodySchema } from "../common/schemas";
import { validate } from "../common/validation";
import * as authService from "../services/auth.service";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(loginBodySchema, req.body || {}, "request body");
    const result = await authService.login(payload);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getAuthenticatedUser(req.userId);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}
