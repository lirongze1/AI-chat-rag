"""定义知识库入库流程与上游服务之间共享的数据结构。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.config import non_empty_str


class _TolerantConfig(BaseModel):
    """可选配置块基类：忽略未知字段，非对象输入按空配置处理。"""

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _coerce_mapping(cls, value: object) -> object:
        return value if isinstance(value, dict) else {}


def _optional_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        try:
            return int(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError, OverflowError):
            return None


class EmbeddingConfig(_TolerantConfig):
    """管理员在 Web 后台配置的 embedding 参数；空值表示沿用环境变量。"""

    provider: Literal["zhipu", "openai"] | None = None
    apiKey: str | None = None
    model: str | None = None
    baseUrl: str | None = None

    @field_validator("apiKey", "model", "baseUrl", mode="before")
    @classmethod
    def _parse_str(cls, value: object) -> object:
        return non_empty_str(value) or None

    @field_validator("provider", mode="before")
    @classmethod
    def _parse_provider(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            return normalized if normalized in {"zhipu", "openai"} else None
        return None


class ChunkConfig(_TolerantConfig):
    """管理员在 Web 后台配置的切块与批量参数；空值表示沿用环境变量。"""

    chunkSize: int | None = None
    chunkOverlap: int | None = None
    embeddingBatchSize: int | None = None

    @field_validator("chunkSize", "chunkOverlap", "embeddingBatchSize", mode="before")
    @classmethod
    def _parse_int(cls, value: object) -> object:
        return _optional_int(value)


# 入库任务在 AI-server 与 Node 服务之间共享的状态枚举。
TaskStatus = Literal["queued", "running", "success", "failed", "cancelled"]


class IngestionJob(BaseModel):
    """描述一次知识库文件入库任务的输入负载。"""

    model_config = ConfigDict(extra="ignore")

    taskId: str
    fileId: str
    userId: str
    fileName: str
    fileExt: str
    fileSizeBytes: int = Field(gt=0)
    contentMd5: str
    storagePath: str
    absoluteFilePath: str
    parseVersion: int = Field(default=1, ge=1)
    embeddingConfig: EmbeddingConfig | None = None
    chunkConfig: ChunkConfig | None = None

    @field_validator("embeddingConfig", "chunkConfig", mode="before")
    @classmethod
    def _coerce_optional_config(cls, value: object) -> object:
        return value if isinstance(value, dict) else None


class ChunkPayload(BaseModel):
    """描述单个知识库文本分块在 Node 侧需要保存的元数据。"""

    chunkIndex: int = Field(ge=0)
    vectorId: str
    chunkHash: str
    contentPreview: str
    pageNumber: int | None = None


class IngestionChunkSyncPayload(BaseModel):
    """用于批量同步知识库分块元数据的请求体。"""

    taskId: str
    fileId: str
    userId: str
    collectionName: str
    parseVersion: int = Field(default=1, ge=1)
    chunks: list[ChunkPayload]


class IngestionCallbackPayload(BaseModel):
    """用于回传知识库入库进度和最终状态的回调请求体。"""

    taskId: str
    fileId: str
    status: TaskStatus
    progress: float = Field(ge=0, le=100)
    chunkCount: int | None = Field(default=None, ge=0)
    errorMessage: str | None = None
