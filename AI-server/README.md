# AI-server

AI-server 是本仓库中的 Python AI 服务，负责两类核心能力：

- 知识库文件入库、切块、向量化、写入 Chroma
- 基于知识库检索结果的流式聊天生成

当前实现基于 FastAPI，对外提供摄取任务接口、向量删除接口和聊天流式接口，作为 Node backend 的 AI 执行层。

## 技术栈

- FastAPI
- LangChain
- Chroma
- Zhipu Embeddings
- OpenAI 兼容聊天模型接口

## 目录结构

```text
AI-server/
├─ main.py
├─ requirements.txt
├─ .env.example
├─ ai_chroma/
└─ app/
   ├─ config.py
   ├─ chat/
   │  ├─ llm.py
   │  ├─ prompts.py
   │  ├─ retriever.py
   │  ├─ schemas.py
   │  └─ service.py
   └─ knowledge_base/
      ├─ callback_signature.py
      ├─ document_loader.py
      ├─ embedding_model.py
      ├─ ingestion_callback_client.py
      ├─ ingestion_service.py
      ├─ schemas.py
      └─ vector_store.py
├─ tests/
│  ├─ test_callback_signature.py
│  ├─ test_config.py
│  └─ test_dynamic_config.py
```

## 主要接口

- `GET /health`: 健康检查
- `POST /ingestion/jobs`: 接收 Node 服务提交的入库任务
- `DELETE /vectors/files/{file_id}`: 删除指定用户的文件向量，必须携带 `user_id`（query 参数 `?user_id=...` 或 JSON body `{"userId": "..."}`），否则返回 400
- `POST /chat/stream`: 执行一次基于知识库的流式聊天

## 管理员在线配置（可选请求字段）

Node backend 会把 Web 后台保存的运行时配置随请求下发，AI-server 仅在这些字段存在且非空时覆盖环境变量：

- `POST /chat/stream` 请求体可附带：
  - `modelConfig: { apiKey, baseUrl, model, temperature }`，覆盖聊天模型与温度
  - `retrievalConfig: { topK, scoreThreshold, contextMessageLimit }`，覆盖检索条数、相关性阈值与历史消息条数
- `POST /ingestion/jobs` 请求体可附带：
  - `embeddingConfig: { provider, apiKey, model, baseUrl }`，`provider` 仅支持 `zhipu` / `openai`
  - `chunkConfig: { chunkSize, chunkOverlap, embeddingBatchSize }`，覆盖切块与批量写入参数

未知字段会被忽略；`null`、空字符串、非法数值都会回退到 settings 默认值，旧客户端无需改动。SSE 事件（`message.started` / `delta` / `sources` / `completed` / `failed`）格式保持不变。

## 环境变量

建议从 `.env.example` 复制一份到 `.env` 后再填写。不是所有配置都必须填写，按功能分组如下。

- 必填，服务启动即校验，为空会抛错：`AI_SERVICE_SHARED_SECRET`（必须与 backend-server 的同名配置一致）
- 必填，知识库入库功能需要：`ZHIPUAI_API_KEY`
- 必填，聊天功能需要：`OPENAI_API_KEY`
- 建议显式填写，聊天功能通常需要：`OPENAI_CHAT_MODEL`
- 可选，有默认值：`NODE_BASE_URL`、`CHROMA_PERSIST_DIRECTORY`、`CHROMA_COLLECTION_NAME`、`INGEST_CHUNK_SIZE`、`INGEST_CHUNK_OVERLAP`、`EMBEDDING_BATCH_SIZE`、`NODE_CALLBACK_TIMEOUT_SECONDS`、`CHAT_RETRIEVAL_TOP_K`、`CHAT_RETRIEVAL_SCORE_THRESHOLD`、`CHAT_CONTEXT_MESSAGE_LIMIT`、`HOST`、`PORT`、`APP_ENV`（默认 `prod`）
- 可选，embedding 兜底默认值：`EMBEDDING_PROVIDER`（`zhipu` 或 `openai`，默认 `zhipu`）、`ZHIPUAI_EMBEDDING_MODEL`（默认 `embedding-3`）、`OPENAI_EMBEDDING_MODEL`（默认 `text-embedding-3-small`）
- 可选，按部署情况填写：`OPENAI_BASE_URL`

环境变量是兜底默认值：管理员在 Web 后台保存的 LLM / embedding / 检索 / 切块配置会随请求下发并优先使用；字段缺失或为空字符串时自动回退到上述环境变量。

如果你只验证知识库入库，不跑聊天，可以先不填 `OPENAI_API_KEY`。

如果你只验证聊天，不跑新的向量入库，可以先不填 `ZHIPUAI_API_KEY`。

`CHAT_RETRIEVAL_TOP_K` 控制最多返回多少个候选 chunk；`CHAT_RETRIEVAL_SCORE_THRESHOLD` 控制最低相关性阈值，范围是 `0` 到 `1`，越高越严格。若问题与知识库无关，命中结果可能少于 `top_k`，甚至为 `0`。

## 安装依赖

```powershell
cd AI-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 启动服务

```powershell
cd AI-server
.\.venv\Scripts\Activate.ps1
python main.py
```

服务默认地址：`http://127.0.0.1:8000`

`main.py` 会读取 `.env` 中的 `HOST` 和 `PORT`；未配置时默认使用 `127.0.0.1:8000`。

`APP_ENV=dev` 时 `uvicorn` 开启热重载；未设置或为其它值时以生产模式启动（不 reload）。

## 运行流程

### 知识库入库

1. backend-server 接收上传文件并写入文件元数据
2. backend-server 调用 `POST /ingestion/jobs`
3. AI-server 后台解析文件并切块
4. 生成向量并写入 Chroma
5. 回调 backend-server 更新任务状态与 chunk 元数据

### 聊天问答

1. client 调用 backend-server 的聊天接口
2. backend-server 转发请求到 AI-server 的聊天流接口
3. AI-server 检索知识库相关内容
4. 组装 prompt 并调用聊天模型流式生成
5. 以 SSE 事件形式返回增量内容与引用来源

## 服务间鉴权与回调签名

- 所有写接口（`POST /ingestion/jobs`、`DELETE /vectors/files/{file_id}`、`POST /chat/stream`）都要求请求头 `x-ai-service-secret` 与 `AI_SERVICE_SHARED_SECRET` 完全一致，比较使用 `hmac.compare_digest`；空密钥或缺失请求头一律返回 401。
- AI-server 回调 backend-server 的 `/ai/ingestion/callback` 与 `/ai/ingestion/chunks` 时，除 `x-ai-service-secret` 外还会附加：
  - `x-ai-timestamp`：当前 unix 秒的字符串
  - `x-ai-signature`：对字符串 `${timestamp}.${原始JSON字符串}` 计算 `HMAC_SHA256(secret, ...)` 得到的 hex 摘要
- 原始 JSON 字符串按 `json.dumps(payload, separators=(',', ':'), ensure_ascii=False)` 生成，并通过 `content=` 原样发送，避免 `json=` 重新序列化导致签名与请求体不一致。Node 侧按收到的原始 body 用相同规则校验。

## 入库与租户隔离

- 新分块以 `job.parseVersion` 作为 metadata 的 `ingest_version` 写入；只有全部写入成功后，才删除同一 `file_id` + `user_id` 下 `ingest_version` 更小的旧向量。任一环节失败时旧向量保持不动。
- 向量删除与检索均按 `user_id` 隔离，删除接口必须显式提供 `user_id`。
- 每个分块还会写入 `embedding_model` 元数据，值为 `f"{provider}:{model}"` 指纹。入库成功后会把生效配置写入 `CHROMA_PERSIST_DIRECTORY/.active_embedding.json`（只保存 provider/model/baseUrl，不保存 apiKey）；检索时按该指纹过滤，避免不同 embedding 的结果混用。
- **切换 embedding 模型（provider 或 model）后必须重新索引知识库**：旧模型向量仍留在 collection 中但会被指纹过滤掉，不会与新模型结果混用。collection 名称在入库与检索侧由 `effective_collection_name()` 统一计算，当前固定沿用 `CHROMA_COLLECTION_NAME`，因此不需要手工改集合名。
- 聊天请求不携带 embeddingConfig，检索端使用最近一次成功入库记录的 provider/model 对查询向量化；若后台切换到 `openai` provider，请在 AI-server 环境变量中同时提供 `OPENAI_API_KEY`（以及必要的 `OPENAI_BASE_URL`），因为 apiKey 不会落盘保存。

## 注意事项

- 当前知识库默认支持 `pdf`、`docx`、`txt`
- `langchain-openai` 负责调用 OpenAI 兼容聊天模型，所以 `OPENAI_BASE_URL` 可接入阿里百炼等兼容接口
- 本地开发默认使用持久化 Chroma，目录位于 `AI-server/ai_chroma`
- `AI_SERVICE_SHARED_SECRET` 为必填项；Node 侧回调校验与调用都必须使用相同密钥

## 单元测试

```powershell
python -m unittest discover -s tests -v
```
