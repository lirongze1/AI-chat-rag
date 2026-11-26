# AI-CHAT-RAG

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Frontend: React](https://img.shields.io/badge/Frontend-React%2018-61dafb.svg)
![Backend: Express](https://img.shields.io/badge/Backend-Express%205-000000.svg)
![AI Server: FastAPI](https://img.shields.io/badge/AI%20Server-FastAPI-009688.svg)

支持多人使用的本地知识库 RAG 问答应用。提供邮箱账号登录、租户隔离的知识库上传与向量化、分块查看、会话管理和基于知识库的流式问答。

## 架构

```text
浏览器
  │  HTTP（同源 /v1）
  ▼
Nginx（client 容器）──静态页面──React 18 + Vite + Tailwind
  │  反向代理 /v1
  ▼
backend-server（Express 5 + Prisma + PostgreSQL）
  │  业务元数据：用户 / 文件 / 任务 / 分块 / 会话 / 消息
  │  JWT 鉴权 + 归属校验 + 任务恢复
  │  REST / SSE，服务间密钥 + HMAC 签名回调
  ▼
AI-server（FastAPI + LangChain + Chroma）
     解析 / 切块 / 智谱 embedding / 向量检索 / OpenAI 兼容模型流式生成
```

- **身份**：邮箱+密码注册登录，bcrypt 哈希，JWT Bearer Token；所有业务接口从 Token 取 userId，不信任客户端自报身份。
- **隔离**：文件、任务、会话、消息、向量均按 userId 过滤；向量删除也必须显式带 userId。
- **服务间安全**：`AI_SERVICE_SHARED_SECRET` 双方必填；回调带时间戳和 HMAC-SHA256 签名，防重放、防伪造。
- **一致性**：入库采用"先写新版本、成功后删旧版本"；Node 侧 DB 驱动的任务调度支持失败重试与重启恢复。
- **流式**：聊天和入库事件都走 SSE；前端带取消、断线重连和畸形事件兜底；Nginx 关闭代理缓冲。

## 快速开始（Docker Compose，推荐）

```bash
cp .env.example .env
# 必须填写：JWT_SECRET、AI_SERVICE_SHARED_SECRET、
# ZHIPUAI_API_KEY（入库）、OPENAI_API_KEY + OPENAI_CHAT_MODEL（聊天）
docker compose up -d --build
```

打开 <http://localhost:8080>，注册账号后即可上传文件、入库并聊天。

服务地址：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Web | http://localhost:8080 | 前端页面，API 走同源 `/v1` |
| API | http://localhost:8080/v1 | 经 Nginx 转发到 backend |
| 健康检查 | `docker compose ps` | postgres / backend / ai-server 均带 healthcheck |

停止：`docker compose down`。数据保存在 `pgdata`、`backend-uploads`、`chroma-data` 三个卷中，`docker compose down` 不会删除数据。

## 本地开发（不装 Docker）

1. 准备一个空的 PostgreSQL 数据库，把连接串写入 `backend-server/.env` 的 `DATABASE_URL`。
2. 在三个子项目目录分别复制 `.env.example` 为 `.env`，填好密钥；`JWT_SECRET` 与 `AI_SERVICE_SHARED_SECRET` 必须在 backend 与 AI-server 中完全一致。
3. 数据库迁移：

```bash
cd backend-server
npm install
npx prisma migrate deploy
npm run dev
```

4. 另开终端：`cd AI-server && python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt && python main.py`
5. 再开终端：`cd client && npm install && npm run dev`，前端默认 <http://localhost:5173>，需把 `backend-server/.env` 的 `CLIENT_ORIGIN` 设为该地址。

旧版 SQLite 迁移已归档在 `backend-server/prisma/legacy-sqlite-migrations/`，不会在 PostgreSQL 上执行；旧指纹数据不自动迁移，请重新注册账号。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/auth/register` | 注册，返回 token |
| POST | `/v1/auth/login` | 登录，返回 token |
| GET | `/v1/auth/me` | 当前用户 |
| POST | `/v1/files/precheck` | 按内容 MD5 预检去重 |
| POST | `/v1/files/upload` | 单文件上传 |
| POST | `/v1/files/upload/chunked/*` | 分片上传：init / chunk / status / complete |
| GET | `/v1/files` | 当前用户文件列表 |
| GET | `/v1/files/:fileId/detail` | 分块详情 |
| POST | `/v1/files/:fileId/ingest` | 派发入库任务 |
| POST | `/v1/files/:fileId/offload` | 出库（删除向量） |
| DELETE | `/v1/files/:fileId` | 删除文件 |
| GET | `/v1/files/events` | 入库事件 SSE |
| GET/POST/DELETE | `/v1/chat/sessions...` | 会话与消息管理 |
| POST | `/v1/chat/sessions/:id/completions` | 流式问答 SSE |

除 `/auth/register`、`/auth/login` 和服务回调外，全部接口需要 `Authorization: Bearer <token>`。

## 已知边界

- 当前是本地/私有部署方案，未内置 SSO、RBAC 角色、审计日志和对象存储；如需企业级身份体系，可在 `requireAuth` 位置接入 OIDC。
- SSE 事件仍保存在 Node 进程内存中，backend 多副本时需要换 Redis pub/sub 或数据库轮询。
- embedding 模型写死为智谱 `embedding-3`；更换模型后需要重建向量库。
- 文件存储使用本地卷，跨节点共享需替换为 S3/NAS。

## License

MIT
