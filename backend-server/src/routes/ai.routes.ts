import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { aiChatBodySchema } from "../common/schemas";
import { validate } from "../common/validation";
import * as aiService from "../services/ai.service";

/** AI proxy routes. Identity always comes from requireAuth (req.userId). */
const aiRouter = Router();

aiRouter.post("/chat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = validate(aiChatBodySchema, req.body || {}, "request body");
    const result = await aiService.requestChat({
      query: payload.query,
      sessionId: payload.sessionId,
      userId: req.userId,
      recentMessages: payload.recentMessages,
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default aiRouter;
