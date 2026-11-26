"""封装知识库入库流程到 Node 元数据服务的 HTTP 回调。"""

from __future__ import annotations

import httpx

from app.config import settings
from app.knowledge_base.callback_signature import build_signed_headers, dumps_canonical
from app.knowledge_base.schemas import IngestionCallbackPayload, IngestionChunkSyncPayload


class KnowledgeIngestionCallbackClient:
    """负责将知识库入库状态和分块元数据回传给 Node 服务。"""

    async def _post(self, path: str, payload: object) -> None:
        """按约定签名并发送回调，请求体与签名基于同一份原始 JSON 字符串。"""

        raw_body = dumps_canonical(payload.model_dump(mode="json"))
        headers = build_signed_headers(settings.ai_service_secret, raw_body)

        async with httpx.AsyncClient(timeout=settings.callback_timeout_seconds) as client:
            # 不能用 json=：httpx 会重新序列化，导致实际请求体与签名不一致。
            response = await client.post(
                f"{settings.node_base_url}{path}",
                headers=headers,
                content=raw_body.encode("utf-8"),
            )
            response.raise_for_status()

    async def send_status(self, payload: IngestionCallbackPayload) -> None:
        """向 Node 元数据服务回传知识库入库任务进度。"""

        await self._post("/ai/ingestion/callback", payload)

    async def sync_chunks(self, payload: IngestionChunkSyncPayload) -> None:
        """在向量写入成功后同步知识库分块元数据。"""

        await self._post("/ai/ingestion/chunks", payload)
