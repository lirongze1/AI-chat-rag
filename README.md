# AI-CHAT-RAG（企业内网版）

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Frontend: React](https://img.shields.io/badge/Frontend-React%2018-61dafb.svg)
![Backend: Express](https://img.shields.io/badge/Backend-Express%205-000000.svg)
![AI Server: FastAPI](https://img.shields.io/badge/AI%20Server-FastAPI-009688.svg)

可私有部署的企业内部知识库 RAG 问答系统。**手机号账号由管理员统一创建，不开放自助注册**；管理员在 Web 后台管理用户，并在线配置 LLM / Embedding / 检索 / 切块参数，改完即时生效，无需改代码或重启。

## 功能特性

- **手机号 + 初始密码登录**：用户不能自己注册，账号由管理员创建并分发初始密码。
- **Web 管理后台**（仅管理员可见）：创建 / 改名 / 改角色 / 重置密码 / 禁用用户；在线编辑模型配置并测试连通性。
- **运行时模型配置**：后台填写的 LLM API Key / 模型名 / Base URL、Embedding 提供商与模型、检索 topK / 阈值 / 上下文条数、切块大小 / 重叠 / 批量大小，会下发给 AI 服务实际使用；数据库加密存储密钥，接口只返回脱敏值。
- **租户隔离**：文件、任务、会话、消息、向量均按用户隔离；删除向量必须带 userId。
- **可靠入库**：先写新版本、成功后删旧版本；Node 侧 DB 驱动调度，失败退避重试、重启可恢复；回调带时间戳 + HMAC-SHA256 签名。
- **流式体验**：聊天与入库事件均走 SSE，前端支持取消、断线重连和畸形事件兜底。

## 架构

```text
浏览器（同源 /v1）
  ▼
Nginx（client 容器）──React 18 + Vite + Tailwind（聊天 / 知识库 / 管理后台）
  │  反向代理 /v1
  ▼
backend-server（Express 5 + Prisma + PostgreSQL）
  │  用户 / 文件 / 任务 / 分块 / 会话 / 消息 + AppConfig 运行时配置
  │  手机号登录 + JWT + 管理员角色 + 租户归属校验
  │  转发请求时把运行时配置下发给 AI 服务
  ▼
AI-server（FastAPI + LangChain + Chroma）
     按请求配置创建 LLM / Embedding，解析、切块、检索、流式生成
```

## 快速开始（Docker Compose，推荐）

```bash
cp .env.example .env
# 必填：JWT_SECRET、AI_SERVICE_SHARED_SECRET、BOOTSTRAP_ADMIN_PHONE、BOOTSTRAP_ADMIN_PASSWORD
# 模型密钥可以在 .env 里填，也可以部署后进管理后台填
docker compose up -d --build
docker compose ps   # 等待 postgres / backend / ai-server 全部 healthy
```

打开 <http://localhost:8080>，用 `.env` 里 `BOOTSTRAP_ADMIN_PHONE` + `BOOTSTRAP_ADMIN_PASSWORD` 登录。管理员侧栏进入 **管理后台**：

1. 在「模型配置」填写 LLM 与 Embedding 的 API Key / 模型名，点「保存」，可用「测试连接」验证。
2. 在「用户管理」为同事创建账号（手机号 + 初始密码），把账号密码分发给他们。

普通用户登录后只能看到聊天和知识库，看不到管理后台。

> 密钥存库时用 AES-256-GCM 加密（密钥由 `JWT_SECRET` 派生），管理接口返回 `****abcd` 这类脱敏值；留空表示不修改，`null` 表示清空。

## 环境变量说明

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `POSTGRES_USER/PASSWORD/DB` | 否 | 数据库账号，默认 `ai_chat_rag` |
| `JWT_SECRET` | 是 | JWT 签名 + 配置加密密钥派生源，务必随机长字符串 |
| `AI_SERVICE_SHARED_SECRET` | 是 | Node 与 AI 服务互调密钥，两侧必须一致 |
| `BOOTSTRAP_ADMIN_PHONE` | 是 | 首次启动创建的管理员手机号（`^1[3-9]\d{9}$`） |
| `BOOTSTRAP_ADMIN_PASSWORD` | 是 | 管理员初始密码（≥8 位） |
| `BOOTSTRAP_ADMIN_RESET_PASSWORD` | 否 | `true` 时每次启动重置管理员密码，默认 `false` |
| `CLIENT_ORIGIN` | 是 | 浏览器来源，CORS 白名单 |
| `OPENAI_API_KEY / BASE_URL / CHAT_MODEL` | 否 | LLM 兜底配置；后台配置优先 |
| `ZHIPUAI_API_KEY` 等 | 否 | Embedding 兜底配置；后台配置优先 |

服务地址：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Web | http://localhost:8080 | 前端页面，API 走同源 `/v1` |
| API | http://localhost:8080/v1 | 经 Nginx 转发到 backend |
| 健康检查 | `docker compose ps` | postgres / backend / ai-server 均带 healthcheck |

停止：`docker compose down`。数据保存在 `pgdata`、`backend-uploads`、`chroma-data` 三个卷中，不会因停止容器而删除。

## 主要接口

公开（无需 Token）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/auth/login` | `{account, password}` 登录，返回 token 和角色 |

用户接口（需 `Authorization: Bearer <token>`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/auth/me` | 当前用户资料 |
| POST | `/v1/files/precheck` / `/upload` | MD5 预检去重 / 单文件上传 |
| POST | `/v1/files/upload/chunked/*` | 分片上传：init / chunk / status / complete |
| GET | `/v1/files` / `/v1/files/:fileId/detail` | 文件列表 / 分块详情 |
| POST | `/v1/files/:fileId/ingest` / `/offload` | 派发入库 / 删除向量 |
| DELETE | `/v1/files/:fileId` | 删除文件 |
| GET | `/v1/files/events` | 入库事件 SSE |
| GET/POST/DELETE | `/v1/chat/sessions...` | 会话与消息管理 |
| POST | `/v1/chat/sessions/:id/completions` | 流式问答 SSE |

管理员接口（需 ADMIN 角色）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/v1/admin/users` | 用户列表（分页）/ 创建用户 |
| PATCH | `/v1/admin/users/:userId` | 改姓名 / 角色 / 启停 |
| POST | `/v1/admin/users/:userId/reset-password` | 重置密码 |
| DELETE | `/v1/admin/users/:userId` | 禁用用户（软删，保留历史数据） |
| GET/PUT | `/v1/admin/config` | 读取脱敏配置 / 保存配置 |
| POST | `/v1/admin/config/test` | 测试 LLM 或 Embedding 连通性 |

> 公开注册已关闭。系统保证至少保留一个启用的管理员，不能把最后一个管理员降级或禁用。

## 本地开发（不装 Docker）

1. 准备空的 PostgreSQL 数据库，把连接串写入 `backend-server/.env` 的 `DATABASE_URL`。
2. 三个子目录分别复制 `.env.example` 为 `.env`；`JWT_SECRET` 与 `AI_SERVICE_SHARED_SECRET` 必须一致。
3. 后端：

```bash
cd backend-server
npm install
npx prisma migrate deploy
npm run dev        # :3001，启动前自动创建引导管理员
```

4. AI 服务：`cd AI-server && python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt && python main.py`（:8000）
5. 前端：`cd client && npm install && npm run dev`（:5173），并把 backend 的 `CLIENT_ORIGIN` 设为该地址。

旧版 SQLite 迁移已归档在 `backend-server/prisma/legacy-sqlite-migrations/`，不会在 PostgreSQL 上执行。

## 已知边界

- 面向**企业内网私有部署**：未内置 SSO / 细粒度 RBAC / 审计日志；角色只有 ADMIN 与 USER 两级。如需对接企业身份系统，可在 `requireAuth` 处接入 OIDC。
- SSE 事件保存在 Node 进程内存，backend 多副本时需换 Redis pub/sub 或数据库轮询；当前按单副本设计。
- 文件使用本地卷存储，跨节点共享需替换为 S3/NAS。
- **切换 Embedding 模型后必须重新上传并索引文档**：模型指纹不同，旧向量不会被检索命中（后台有提示）。
- 配置内存缓存 30 秒，多副本部署时后台改配置最长 30 秒后全体生效。

## License

MIT
