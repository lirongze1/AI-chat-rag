
"""FastAPI 入口，暴露健康检查、摄取与聊天接口。"""

from __future__ import annotations

import hmac
import os

import uvicorn
from fastapi import BackgroundTasks, Body, FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.chat.schemas import ChatRequest
from app.chat.service import stream_chat_events
from app.config import settings
from app.knowledge_base.ingestion_service import process_knowledge_ingestion_job
from app.knowledge_base.schemas import IngestionJob
from app.knowledge_base.vector_store import KnowledgeVectorStore

app = FastAPI(title="AI Server", version="0.1.0")


class VectorDeleteRequest(BaseModel):
    """通过请求体指定待删除向量所属的租户。"""

    userId: str | None = None


def _require_ai_secret(provided: str | None) -> None:
    """定时安全比较服务间密钥；任一侧为空都拒绝访问。"""

    expected = settings.ai_service_secret
    if (
        not expected
        or not provided
        or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
    ):
        raise HTTPException(status_code=401, detail="Invalid AI service secret")


@app.get("/health")
def health() -> dict[str, bool]:
    """返回轻量级健康检查结果。"""

    return {"ok": True}


@app.post("/ingestion/jobs", status_code=202)
async def create_ingestion_job(
    payload: IngestionJob,
    background_tasks: BackgroundTasks,
    x_ai_service_secret: str | None = Header(default=None),
) -> dict[str, object]:
    """接收摄取任务，并在后台异步执行。"""

    _require_ai_secret(x_ai_service_secret)

    # 通过 BackgroundTasks 将耗时的解析和向量化流程移出请求主链路。
    background_tasks.add_task(process_knowledge_ingestion_job, payload)
    return {
        "accepted": True,
        "taskId": payload.taskId,
        "fileId": payload.fileId,
    }


@app.delete("/vectors/files/{file_id}")
def delete_file_vectors(
    file_id: str,
    x_ai_service_secret: str | None = Header(default=None),
    user_id: str | None = Query(default=None),
    payload: VectorDeleteRequest | None = Body(default=None),
) -> dict[str, object]:
    """删除某个用户在某个文件下的所有分块，必须显式指定租户。"""

    _require_ai_secret(x_ai_service_secret)

    resolved_user_id = (user_id or (payload.userId if payload else None) or "").strip()
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    vector_store = KnowledgeVectorStore()
    vector_store.delete_file_chunks(file_id, resolved_user_id)

    return {
        "deleted": True,
        "fileId": file_id,
        "userId": resolved_user_id,
    }


@app.post("/chat/stream")
async def stream_chat(
    payload: ChatRequest,
    x_ai_service_secret: str | None = Header(default=None),
) -> StreamingResponse:
    """执行一次基于知识库检索增强的流式聊天。"""

    _require_ai_secret(x_ai_service_secret)

    return StreamingResponse(stream_chat_events(payload), media_type="text/event-stream")


if __name__ == "__main__":
    # 仅开发环境开启热重载，避免生产环境额外进程与文件监听开销。
    reload = os.getenv("APP_ENV", "").strip().lower() == "dev"
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=reload)
