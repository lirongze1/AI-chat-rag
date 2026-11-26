import cors from "cors";
import express, { type Request } from "express";
import { errorHandler } from "./common/errors";
import { config } from "./config";
import routes from "./routes/index";

export const app = express();

// Cross-origin access is limited to explicitly configured client origins.
app.use(
  cors({
    origin: config.clientOrigins.length === 1 ? config.clientOrigins[0] : config.clientOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-ai-service-secret",
      "x-ai-timestamp",
      "x-ai-signature",
    ],
  }),
);

// Keep the exact JSON bytes so callback signatures can be verified.
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as unknown as Request).rawBody = buf.toString("utf8");
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// All business APIs are served under /v1.
app.use("/v1", routes);

// Keep error middleware last so thrown errors are normalized.
app.use(errorHandler);
