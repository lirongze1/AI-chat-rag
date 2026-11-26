# backend-server

企业内部管理后端：手机号账号鉴权、管理员用户/配置管理、文件与分片上传、聊天会话、ingestion 任务编排，以及 AI-server 代理与回调。数据库使用 PostgreSQL + Prisma。

## 技术栈

- Express 5 + TypeScript
- Prisma + PostgreSQL
- bcryptjs + jsonwebtoken（JWT）
- AES-256-GCM（运行时配置中的 API Key 加密）
- Multer + Zod

## 启动前置条件

`DATABASE_URL`、`JWT_SECRET`、`CLIENT_ORIGIN`、`AI_SERVICE_SHARED_SECRET`、`BOOTSTRAP_ADMIN_PHONE`、`BOOTSTRAP_ADMIN_PASSWORD` 均为必填，任一为空时启动失败（fail-fast）。`ZHIPUAI_API_KEY` / `OPENAI_*` 均为可选兜底，不再要求。复制 `.env.example` 为 `.env` 后填写真实值（不要把真实密钥提交到仓库）。

```bash
npm install
npm run prisma:generate
npm run prisma:migrate        # prisma migrate deploy
npm run dev
```

启动时 `await ensureBootstrapAdmin()`（在 `listen` 之前）：指定手机号不存在则创建 `ADMIN`（密码 bcrypt 哈希、`displayName` 默认「系统管理员」）；存在但非 ADMIN 则升级；只有 `BOOTSTRAP_ADMIN_RESET_PASSWORD=true` 时才重置密码。该过程幂等，日志只打印脱敏手机号，不打印密码。

## 鉴权用法

**公开注册已关闭**：`POST /v1/auth/register` 已移除，账号由引导管理员或管理员接口创建。

1. 手机号（或历史 email）登录，拿到 `data.token`：

```bash
curl -X POST http://localhost:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"13800000000","password":"至少8位"}'
```

响应：`{"data":{"userId":"...","phone":"...","email":null,"displayName":"...","role":"ADMIN","isActive":true,"token":"..."}}`

2. 当前账号信息（需 Bearer Token）：

```bash
curl http://localhost:3001/v1/auth/me -H 'Authorization: Bearer <token>'
# {"data":{"userId":"...","phone":"...","email":null,"displayName":"...","role":"ADMIN","isActive":true}}
```

- `requireAuth` 每次请求都查库校验账号存在且 `isActive=true`，禁用用户返回 401，并把角色挂到 `req.userRole`。
- 除 `/v1/auth/login`、`签名的 /v1/ai/ingestion/*` 回调和 `/health` 外，全部 `/v1` 路由强制鉴权。
- 身份只来自 JWT 的 `req.userId`；body/query 携带 `userId` 或 `browserFingerprintHash` 且与 token 不一致返回 403，一致也会被忽略。

## 管理员接口（需 ADMIN 角色）

全部位于 `/v1/admin`，先 `requireAuth` 再 `requireAdmin`，非 ADMIN 返回 403。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/admin/users?page=1&limit=20` | 用户分页列表 |
| POST | `/v1/admin/users` | 创建用户：`{ phone, password, displayName?, role? }`；手机号 `^1[3-9]\d{9}$`，密码 8-128 位，重复手机号 409 |
| PATCH | `/v1/admin/users/:userId` | 更新 `{ displayName?, role?, isActive? }` |
| POST | `/v1/admin/users/:userId/reset-password` | `{ newPassword }`，bcrypt 重置 |
| DELETE | `/v1/admin/users/:userId` | 软删：`isActive=false`，保留历史数据 |
| GET | `/v1/admin/config` | 脱敏配置（apiKey 形如 `****abcd` 或 `""`，附 `configured` 标志） |
| PUT | `/v1/admin/config` | 完整配置对象，写库并刷新缓存 |
| POST | `/v1/admin/config/test` | `{ kind: "llm" \| "embedding" }` 轻量连通性探测 |

降级、禁用或删除「最后一个启用中的 ADMIN」返回 409。用户字段统一为 `{ userId, phone, email, displayName, role, isActive, createdAt }`。

## 运行时配置

`PUT /v1/admin/config` 接收完整结构：

```json
{
  "llm": { "apiKey": "", "baseUrl": "", "model": "qwen-plus", "temperature": 0.2 },
  "embedding": { "provider": "zhipu", "apiKey": "", "model": "embedding-3", "baseUrl": "" },
  "retrieval": { "topK": 5, "scoreThreshold": 0.35, "contextMessageLimit": 8 },
  "chunk": { "chunkSize": 800, "chunkOverlap": 120, "embeddingBatchSize": 64 }
}
```

`apiKey` 规则：`""` 表示保持原值，`null` 表示清空，新值表示更新；新值用 AES-256-GCM 加密后存入 `AppConfig.data`（密钥由 `JWT_SECRET` sha256 派生，见 `src/services/secretCrypto.ts`）。其它字段直接存储。配置在 `src/services/runtimeConfigService.ts` 中读取、解密并内存缓存 30 秒；字段为空或 DB 不可达时回退到 `.env` 中的 `OPENAI_*` / `ZHIPUAI_API_KEY` 等变量，不会让聊天接口 500。

生效配置会随请求转发给 Python：`/chat/stream` 与 `/chat` 的 JSON 增加 `modelConfig: { apiKey, baseUrl, model, temperature }` 和 `retrievalConfig: { topK, scoreThreshold, contextMessageLimit }`；ingestion job 增加 `embeddingConfig: { provider, apiKey, model, baseUrl }` 与 `chunkConfig: { chunkSize, chunkOverlap, embeddingBatchSize }`。原有 `taskId/fileId/userId/parseVersion/collectionName` 不变。

`/v1/admin/config/test` 为**简化探测**：用当前生效配置的 `baseUrl` 请求 `GET /models`，返回 `{ reachable, message, simplified: true }`；未配置 key/baseUrl 时返回 `reachable=false` 并给出明确原因，网络失败返回 502 `CONFIG_TEST_FAILED`。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `JWT_SECRET` | 是 | JWT 签名密钥，同时派生配置加密密钥 |
| `CLIENT_ORIGIN` | 是 | 允许的浏览器来源，逗号分隔 |
| `AI_SERVICE_SHARED_SECRET` | 是 | 与 AI-server 共享密钥，回调用 `timingSafeEqual` 校验 |
| `BOOTSTRAP_ADMIN_PHONE` | 是 | 引导管理员手机号 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 是 | 引导管理员初始密码（仅写入 bcrypt 哈希） |
| `BOOTSTRAP_ADMIN_RESET_PASSWORD` | 否 | `true` 时重启重置引导管理员密码 |
| `JWT_EXPIRES_IN` / `PORT` / `AI_SERVICE_*` / `UPLOAD_MAX_FILE_SIZE_MB` / `INGESTION_*` | 否 | 原有可选参数 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_CHAT_MODEL` / `ZHIPUAI_API_KEY` | 否 | 运行时配置为空时的兜底 |
| `CHAT_RETRIEVAL_TOP_K` / `CHAT_RETRIEVAL_SCORE_THRESHOLD` / `CHAT_CONTEXT_MESSAGE_LIMIT` | 否 | 检索默认参数 |
| `INGEST_CHUNK_SIZE` / `INGEST_CHUNK_OVERLAP` / `EMBEDDING_BATCH_SIZE` | 否 | 切块与批处理默认参数 |

## 回调签名

AI-server 回调 `/v1/ai/ingestion/callback` 与 `/chunks` 必须带 `x-ai-service-secret`、`x-ai-timestamp`（unix 秒，允许 5 分钟偏差）、`x-ai-signature`（`HMAC_SHA256(secret, `${timestamp}.${原始JSON字符串}`)` 的 hex）。Node 用 `express.json` 的 `verify` 保存原始 body 校验，不符返回 401。

## 任务可靠性

ingestion 任务持久化在 DB：启动和恢复轮询会把 queued 到期任务、running 超时任务重新派发；派发失败写入 `error_message`，按指数退避更新 `next_retry_at` 重试，超过上限标记 failed。

## 迁移说明

`prisma/migrations/20261126_add_admin_and_config` 为增量迁移：`ALTER TABLE` 增加 `phone/role/is_active`、放宽 `email` 为可空、创建唯一索引和 `app_configs` 表，不删除任何历史表或列。旧 SQLite migrations 位于 `prisma/legacy-sqlite-migrations/`，不会被执行。

## 补充文档

- [docs/api-spec.md](docs/api-spec.md)（历史接口说明，鉴权规则以本文为准）
- [docs/node-service-functional-guide.md](docs/node-service-functional-guide.md)
- [prisma/schema-design.md](prisma/schema-design.md)（历史设计稿）
