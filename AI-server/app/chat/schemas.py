"""定义聊天业务对外暴露的数据结构。"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.config import coerce_float, coerce_int, non_empty_str, settings


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


def _optional_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if math.isfinite(parsed) else None


class ModelConfig(_TolerantConfig):
    """管理员在 Web 后台配置的 LLM 参数；空值表示沿用环境变量。"""

    apiKey: str | None = None
    baseUrl: str | None = None
    model: str | None = None
    temperature: float | None = None

    @field_validator("apiKey", "baseUrl", "model", mode="before")
    @classmethod
    def _parse_str(cls, value: object) -> object:
        return non_empty_str(value) or None

    @field_validator("temperature", mode="before")
    @classmethod
    def _parse_temperature(cls, value: object) -> object:
        return _optional_float(value)


class RetrievalConfig(_TolerantConfig):
    """管理员在 Web 后台配置的检索参数；空值表示沿用环境变量。"""

    topK: int | None = None
    scoreThreshold: float | None = None
    contextMessageLimit: int | None = None

    @field_validator("topK", "contextMessageLimit", mode="before")
    @classmethod
    def _parse_int(cls, value: object) -> object:
        return _optional_int(value)

    @field_validator("scoreThreshold", mode="before")
    @classmethod
    def _parse_float(cls, value: object) -> object:
        return _optional_float(value)


@dataclass(frozen=True)
class EffectiveRetrievalConfig:
    """解析后的检索参数，已回退环境变量并钳制到合法区间。"""

    top_k: int
    score_threshold: float
    context_message_limit: int


def resolve_retrieval_config(config: RetrievalConfig | None) -> EffectiveRetrievalConfig:
    """把请求中的检索配置与 settings 默认值合并，缺失或非法值回退默认值。"""

    config = config or RetrievalConfig()
    return EffectiveRetrievalConfig(
        top_k=coerce_int(config.topK, settings.chat_retrieval_top_k, minimum=1),
        score_threshold=coerce_float(
            config.scoreThreshold,
            settings.chat_retrieval_score_threshold,
            0.0,
            1.0,
        ),
        context_message_limit=coerce_int(
            config.contextMessageLimit, settings.chat_context_message_limit, minimum=1
        ),
    )


class ChatRequest(BaseModel):
    """Node 发给 Python 的流式聊天请求体。"""

    model_config = ConfigDict(extra="ignore")

    query: str = Field(min_length=1)
    sessionId: str | None = None
    userId: str
    recentMessages: list[ChatHistoryMessage] = Field(default_factory=list)
    modelConfig: ModelConfig | None = None
    retrievalConfig: RetrievalConfig | None = None
    # 检索时需复用入库时的 embedding 模型与密钥，否则后台切换模型后检索会失效。
    embeddingConfig: dict[str, object] | None = None

    @field_validator("modelConfig", "retrievalConfig", "embeddingConfig", mode="before")
    @classmethod
    def _coerce_optional_config(cls, value: object) -> object:
        return value if isinstance(value, dict) else None


class ChatSource(BaseModel):
    """返回给 Node/前端的引用信息。"""

    fileId: str | None = None
    fileName: str | None = None
    pageNumber: int | None = None
    chunkIndex: int | None = None
    snippet: str


class ChatStreamEvent(BaseModel):
    """统一的聊天流事件。"""

    type: Literal[
        "message.started",
        "message.delta",
        "message.sources",
        "message.completed",
        "message.failed",
    ]
    delta: str | None = None
    sources: list[ChatSource] = Field(default_factory=list)
    message: str | None = None
    code: str | None = None
