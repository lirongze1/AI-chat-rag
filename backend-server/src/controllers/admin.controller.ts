import type { NextFunction, Request, Response } from "express";
import {
  adminUserIdParamsSchema,
  adminUsersQuerySchema,
  appConfigBodySchema,
  configTestBodySchema,
  createAdminUserBodySchema,
  resetPasswordBodySchema,
  updateAdminUserBodySchema,
} from "../common/schemas";
import { validate } from "../common/validation";
import * as adminUserService from "../services/adminUser.service";
import * as runtimeConfigService from "../services/runtimeConfigService";

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(adminUsersQuerySchema, req.query || {}, "query params");
    res.json({ data: await adminUserService.listUsers(query) });
  } catch (error) {
    next(error);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(createAdminUserBodySchema, req.body || {}, "request body");
    res.status(201).json({ data: await adminUserService.createUser(payload) });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = validate(adminUserIdParamsSchema, req.params || {}, "path params");
    const payload = validate(updateAdminUserBodySchema, req.body || {}, "request body");
    res.json({ data: await adminUserService.updateUser(userId, payload) });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = validate(adminUserIdParamsSchema, req.params || {}, "path params");
    const payload = validate(resetPasswordBodySchema, req.body || {}, "request body");
    res.json({ data: await adminUserService.resetPassword(userId, payload.newPassword) });
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = validate(adminUserIdParamsSchema, req.params || {}, "path params");
    res.json({ data: await adminUserService.softDeleteUser(userId) });
  } catch (error) {
    next(error);
  }
}

export async function getConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await runtimeConfigService.getMaskedConfig() });
  } catch (error) {
    next(error);
  }
}

export async function putConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(appConfigBodySchema, req.body || {}, "request body");
    const data = await runtimeConfigService.saveConfig(payload, req.userId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function testConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = validate(configTestBodySchema, req.body || {}, "request body");
    res.json({ data: await runtimeConfigService.testConfigConnection(payload.kind) });
  } catch (error) {
    next(error);
  }
}
