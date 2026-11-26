"""实现知识库文件的解析、切块、向量化和状态回调流程。"""

from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import coerce_int, settings
from app.knowledge_base.document_loader import load_knowledge_documents
from app.knowledge_base.embedding_model import (
    effective_collection_name,
    embedding_fingerprint,
    write_active_embedding_config,
)
from app.knowledge_base.ingestion_callback_client import KnowledgeIngestionCallbackClient
from app.knowledge_base.schemas import (
    ChunkConfig,
    IngestionCallbackPayload,
    IngestionChunkSyncPayload,
    IngestionJob,
)
from app.knowledge_base.vector_store import KnowledgeVectorStore


_whitespace_re = re.compile(r"\s+")


def _normalize_text(value: str) -> str:
    """压缩连续空白字符，生成更紧凑的文本预览。"""

    return _whitespace_re.sub(" ", value).strip()


def _build_preview(value: str, limit: int = 240) -> str:
    """为 Node 侧元数据生成简短的分块摘要。"""

    normalized = _normalize_text(value)
    return normalized[:limit] if normalized else "(empty chunk)"


def _resolve_chunk_settings(
    chunk_config: ChunkConfig | None,
) -> tuple[int, int, int]:
    """合并后台切块配置与 settings 默认值，返回切块大小、重叠和批量大小。"""

    chunk_size = coerce_int(
        chunk_config.chunkSize if chunk_config else None,
        settings.chunk_size,
        minimum=1,
    )
    # 重叠必须小于切块大小，否则 RecursiveCharacterTextSplitter 会拒绝切块。
    chunk_overlap = coerce_int(
        chunk_config.chunkOverlap if chunk_config else None,
        settings.chunk_overlap,
        minimum=0,
        maximum=chunk_size - 1,
    )
    batch_size = coerce_int(
        chunk_config.embeddingBatchSize if chunk_config else None,
        settings.embedding_batch_size,
        minimum=1,
    )
    return chunk_size, chunk_overlap, batch_size


async def process_knowledge_ingestion_job(job: IngestionJob) -> None:
    """执行单个知识库文件的完整入库流程。"""

    callback_client = KnowledgeIngestionCallbackClient()

    try:
        # 先通知上游任务已经开始执行，便于前端尽快进入处理中状态。
        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="running",
                progress=5,
            )
        )

        file_path = Path(job.absoluteFilePath)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # 文件存在后再推进进度，避免上游误以为解析已经开始。
        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="running",
                progress=15,
            )
        )

        embedding_config = (
            job.embeddingConfig.model_dump(exclude_none=True)
            if job.embeddingConfig is not None
            else None
        )
        chunk_size, chunk_overlap, batch_size = _resolve_chunk_settings(job.chunkConfig)
        embedding_model_name = embedding_fingerprint(embedding_config)
        knowledge_vector_store = KnowledgeVectorStore(
            embedding_config=embedding_config,
            embedding_batch_size=batch_size,
        )

        documents = load_knowledge_documents(str(file_path))
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        split_documents = splitter.split_documents(documents)

        # 先上报预计分块数，让 Node 侧可以同步更新任务统计信息。
        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="running",
                progress=45,
                chunkCount=len(split_documents),
            )
        )

        # 不再先删后写：新版本向量写入成功后再清理旧版本，失败时旧向量保持可用。
        chunk_documents: list[Document] = []
        ids: list[str] = []
        chunk_payloads = []

        for chunk_index, document in enumerate(split_documents):
            text = document.page_content.strip()
            if not text:
                continue

            vector_id = str(uuid.uuid4())
            chunk_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
            page_number = document.metadata.get("page")
            page_number = int(page_number) if isinstance(page_number, int) else None
            preview = _build_preview(text)

            ids.append(vector_id)
            # 这些 metadata 随向量写入 Chroma，供按文件、用户和版本维度清理与追踪。
            chunk_documents.append(
                Document(
                    id=vector_id,
                    page_content=text,
                    metadata={
                        "user_id": job.userId,
                        "file_id": job.fileId,
                        "task_id": job.taskId,
                        "chunk_index": chunk_index,
                        "page_number": page_number,
                        "file_name": job.fileName,
                        "content_md5": job.contentMd5,
                        "ingest_version": job.parseVersion,
                        # provider:model 指纹，检索时按此过滤，避免混用不可兼容的向量。
                        "embedding_model": embedding_model_name,
                    },
                )
            )
            chunk_payloads.append({
                "chunkIndex": chunk_index,
                "vectorId": vector_id,
                "chunkHash": chunk_hash,
                "contentPreview": preview,
                "pageNumber": page_number,
            })

        # 向量写入前再次推进进度，区分“已切块”和“已落库”两个阶段。
        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="running",
                progress=70,
                chunkCount=len(chunk_payloads),
            )
        )

        knowledge_vector_store.add_chunks(documents=chunk_documents, ids=ids)
        # 写入成功后才更新生效配置；失败时检索仍沿用上一版 embedding 指纹。
        write_active_embedding_config(embedding_config)

        # 全部新向量写入成功后，才删除同文件同用户下版本更旧的向量；
        # 任一前置步骤失败都会走 except 分支，旧向量保持不动。
        knowledge_vector_store.delete_older_ingest_versions(
            job.fileId,
            job.userId,
            job.parseVersion,
        )

        # 向量落库成功后，再同步 Node 侧需要展示和检索的分块元信息。
        await callback_client.sync_chunks(
            IngestionChunkSyncPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                userId=job.userId,
                collectionName=effective_collection_name(embedding_config),
                parseVersion=job.parseVersion,
                chunks=chunk_payloads,
            )
        )

        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="success",
                progress=100,
                chunkCount=len(chunk_payloads),
            )
        )
    except Exception as error:  # noqa: BLE001
        # 任意阶段失败都统一回传失败状态，避免上游任务卡在 running。
        await callback_client.send_status(
            IngestionCallbackPayload(
                taskId=job.taskId,
                fileId=job.fileId,
                status="failed",
                progress=100,
                errorMessage=str(error),
            )
        )
