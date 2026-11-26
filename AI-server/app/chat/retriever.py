"""封装聊天业务中的知识库检索与来源整理。"""

from __future__ import annotations

from app.chat.schemas import ChatRequest, ChatSource, resolve_retrieval_config
from app.knowledge_base.vector_store import KnowledgeVectorStore


def build_chat_sources(payload: ChatRequest) -> list[ChatSource]:
    """根据用户问题从知识库检索来源，并进行去重整理。"""

    effective = resolve_retrieval_config(payload.retrievalConfig)
    # 检索端复用后台下发的 embedding 配置，保证与入库端模型/密钥一致。
    store = KnowledgeVectorStore(embedding_config=payload.embeddingConfig)
    matches = store.retrieve_chunks(
        payload.query,
        payload.userId,
        effective.top_k,
        effective.score_threshold,
    )
    sources: list[ChatSource] = []

    for document, _score in matches:
        metadata = document.metadata or {}
        raw_page_number = metadata.get("page_number")
        raw_chunk_index = metadata.get("chunk_index")
        snippet = document.page_content.strip().replace("\n", " ")
        sources.append(
            ChatSource(
                fileId=str(metadata.get("file_id") or "") or None,
                fileName=str(metadata.get("file_name") or "") or None,
                pageNumber=raw_page_number if isinstance(raw_page_number, int) else None,
                chunkIndex=raw_chunk_index if isinstance(raw_chunk_index, int) else None,
                snippet=snippet[:240] if snippet else "(empty chunk)",
            )
        )

    deduped: list[ChatSource] = []
    seen: set[tuple[str | None, int | None, int | None, str]] = set()

    for source in sources:
        key = (source.fileId, source.pageNumber, source.chunkIndex, source.snippet)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(source)

    return deduped