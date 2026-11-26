import { Router } from "express";
import * as fileController from "../controllers/file.controller";
import { requireAiCallback } from "../middleware/aiCallbackAuth";

/** Service-to-service callbacks; authenticated by shared secret + HMAC signature. */
const ingestionRouter = Router();

ingestionRouter.post("/callback", requireAiCallback, fileController.ingestionCallback);
ingestionRouter.post("/chunks", requireAiCallback, fileController.syncIngestionChunks);

export default ingestionRouter;
