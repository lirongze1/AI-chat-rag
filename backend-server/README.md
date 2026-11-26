# backend-server

Node.js 业务中台：邮箱账号鉴权、文件/分片上传、聊天会话/消息、ingestion 任务编排，以及 AI-server 代理与回调。数据库使用 PostgreSQL + Prisma。

## 技术栈

- Express 5 + TypeScript
- Prisma + PostgreSQL
- bcryptjs + jsonwebtoken（JWT）
- Multer + Zod

## 启动前置条件

`JWT_SECRET`、`AI_SERVICE_SHARED_SECRET`、`DATABASE_URL`、`CLIENT_ORIGIN` 均为必填；任一为空时服务启动失败（fail-fast）。复制 `.env.example` 为 `.env` 后填写真实值。

```bash
npm install
npm run prisma:generate
npm run prisma:migrate        # prisma migrate deploy
npm run dev
```

本地开发需要调整迁移时可用 `npm run prisma:migrate:dev`。

## 鉴权用法

1. 注册或登录，拿到 `data.token`：

```bash
curl -X POST http://localhost:3001/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"至少8位","displayName":"Alice"}'

curl -X POST http://localhost:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"至少8位"}'
```

响应：`{"data":{"userId":"...","email":"...","displayName":"...","token":"..."}}`

2. 之后所有业务请求带 Bearer Token：

```bash
curl http://localhost:3001/v1/auth/me \
  -H 'Authorization: Bearer <token>'
```

- 除 `/v1/auth/*`、签名的 `/v1/ai/ingestion/*` 回调和 `/health` 外，全部 `/v1` 路由强制鉴权。
- 用户身份只来自 JWT 的 `req.userId`。body/query 中携带 `userId` 或 `browserFingerprintHash` 且与 token 不一致时返回 `403`；一致时也会被忽略，不会作为身份来源。
- `POST /v1/ai/chat` 同样使用 token 身份覆盖转发给 Python 的 `userId`。

## 主要接口前缀

- `/health`、`/v1/auth/*`
- `/v1/files/**`、`/v1/tasks/**`
- `/v1/chat/**`、`/v1/ai/chat`
- `/v1/ai/ingestion/callback`、`/v1/ai/ingestion/chunks`（服务间回调）

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `JWT_SECRET` | 是 | JWT 签名密钥，缺失/空值启动失败 |
| `JWT_EXPIRES_IN` | 否 | Token 有效期，默认 `7d` |
| `CLIENT_ORIGIN` | 是 | 允许的浏览器来源，逗号分隔；CORS 不再全开 |
| `AI_SERVICE_SHARED_SECRET` | 是 | 与 AI-server 共享密钥，缺失/空值启动失败；密钥比较用 `timingSafeEqual` |
| `PORT` | 否 | 默认 `3001` |
| `AI_SERVICE_BASE_URL` | 否 | Python AI 服务地址 |
| `AI_SERVICE_TIMEOUT_MS` | 否 | 上游超时，默认 `12000` |
| `UPLOAD_MAX_FILE_SIZE_MB` | 否 | 单文件上传上限 |
| `AI_INGESTION_ENDPOINT` / `AI_VECTOR_DELETE_ENDPOINT` | 否 | Python 接口地址覆盖 |
| `INGESTION_RUNNING_TIMEOUT_MS` | 否 | running 任务判定超时，默认 300000 |
| `INGESTION_POLL_INTERVAL_MS` | 否 | 恢复轮询间隔，默认 10000 |
| `INGESTION_RETRY_BASE_MS` / `INGESTION_RETRY_MAX_MS` | 否 | 派发失败退避区间 |
| `INGESTION_MAX_ATTEMPTS` | 否 | 最大派发尝试次数，默认 8 |

## 回调签名

AI-server 回调 `/v1/ai/ingestion/callback` 与 `/chunks` 时必须带：

- `x-ai-service-secret`：与 `AI_SERVICE_SHARED_SECRET` 一致
- `x-ai-timestamp`：unix 秒，允许 5 分钟偏差
- `x-ai-signature`：`HMAC_SHA256(secret, `${timestamp}.${原始JSON字符串}`)` 的 hex

Node 使用 `express.json` 的 `verify` 保存原始 body 进行校验，任一不符返回 `401`。

## 任务可靠性

ingestion 任务持久化在 DB：服务启动和恢复轮询会把 queued 到期任务、running 超时任务重新派发；派发失败会写入 `error_message`，按指数退避更新 `next_retry_at` 后重试，超过上限标记 failed 并记录原因。不再使用 fire-and-forget 或吞掉异常。

## 迁移说明

旧 SQLite migrations 已移至 `prisma/legacy-sqlite-migrations/`，不会被 Prisma 执行。当前 `prisma/migrations/` 只包含一份全新的 PostgreSQL 初始化迁移，需在空库上执行。旧的指纹身份数据不会自动迁移，用户需通过注册接口创建账号。

## 补充文档

- [docs/api-spec.md](docs/api-spec.md)（历史接口说明，鉴权规则以本文为准）
- [docs/node-service-functional-guide.md](docs/node-service-functional-guide.md)
- [prisma/schema-design.md](prisma/schema-design.md)（历史设计稿）
