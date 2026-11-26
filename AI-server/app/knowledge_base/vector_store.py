"""封装知识库 Chroma 向量库读写操作。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain_chroma import Chroma
from langchain_core.documents import Document

from app.config import coerce_int, settings
from app.knowledge_base.embedding_model import (
    create_embedding_model,
    effective_collection_name,
    embedding_fingerprint,
    read_active_embedding_config,
)


class KnowledgeVectorStore:
    """负责知识库文件分块向量的删除、写入与检索。"""

    def __init__(
        self,
        embedding_config: dict[str, Any] | None = None,
        embedding_batch_size: int | None = None,
    ) -> None:
        """初始化 Chroma collection，并解析当前生效的 embedding 指纹。"""

        Path(settings.chroma_persist_directory).mkdir(parents=True, exist_ok=True)
        active_config = read_active_embedding_config()
        resolved_config = embedding_config if embedding_config is not None else active_config

        embedding = create_embedding_model(resolved_config)
        self._fingerprint = embedding_fingerprint(resolved_config)
        # 历史数据没有 embedding_model 字段；只有确实记录过生效配置后才严格按指纹过滤。
        self._filter_by_fingerprint = active_config is not None

        self._store = Chroma(
            collection_name=effective_collection_name(resolved_config),
            embedding_function=embedding,
            persist_directory=settings.chroma_persist_directory,
        )
        self._embedding_batch_size = coerce_int(
            embedding_batch_size, settings.embedding_batch_size, minimum=1
        )

    def delete_file_chunks(self, file_id: str, user_id: str) -> None:
        """删除指定用户在指定文件下的全部向量，不跨租户误删。"""

        self._store.delete(where={"file_id": file_id, "user_id": user_id})

    @staticmethod
    def _extract_ids_and_metadatas(
        results: Any,
    ) -> tuple[list[str], list[dict[str, Any] | None]]:
        """兼容 Chroma 原生返回结构与 LangChain Document 列表。"""

        if isinstance(results, dict):
            ids = list(results.get("ids") or [])
            metadatas = list(results.get("metadatas") or [])
        else:
            documents = list(results)
            ids = [getattr(document, "id", "") for document in documents]
            metadatas = [getattr(document, "metadata", None) for document in documents]

        if not metadatas:
            metadatas = [None] * len(ids)
        return ids, metadatas

    def delete_older_ingest_versions(
        self,
        file_id: str,
        user_id: str,
        ingest_version: int,
    ) -> None:
        """仅清理同文件、同用户下版本更旧的向量，保留本次及更高版本。"""

        # 先按租户与文件取出旧 id 再按 id 删除，避免依赖 where 中 $and/$ne 的
        # 版本兼容差异；缺少版本字段的历史向量也一并视为旧版本。
        results = self._store.get(
            where={"file_id": file_id, "user_id": user_id},
            include=["metadatas"],
        )
        ids, metadatas = self._extract_ids_and_metadatas(results)

        old_ids = [
            vector_id
            for vector_id, metadata in zip(ids, metadatas)
            if not isinstance(metadata, dict)
            or not isinstance(metadata.get("ingest_version"), int)
            or metadata["ingest_version"] < ingest_version
        ]
        if old_ids:
            self._store.delete(ids=old_ids)

    def add_chunks(
        self,
        documents: list[Document],
        ids: list[str],
    ) -> None:
        """将知识库文本分块及其元数据批量写入向量库。"""

        if not documents:
            return

        # 嵌入请求按批次提交，避免单次写入过大导致超时或内存抖动。
        for start in range(0, len(documents), self._embedding_batch_size):
            end = start + self._embedding_batch_size
            self._store.add_documents(
                documents=documents[start:end],
                ids=ids[start:end],
            )

    def retrieve_chunks(
        self,
        query: str,
        user_id: str,
        top_k: int = 5,
        score_threshold: float = 0.35,
    ) -> list[tuple[Document, float]]:
        """按用户维度检索分块，并用 embedding 指纹隔离不同模型的向量。"""

        where: dict[str, Any] = {"user_id": user_id}
        if self._filter_by_fingerprint:
            where = {
                "$and": [
                    {"user_id": user_id},
                    {"embedding_model": self._fingerprint},
                ]
            }

        return self._store.similarity_search_with_relevance_scores(
            query=query,
            k=top_k,
            filter=where,
            score_threshold=score_threshold,
        )
