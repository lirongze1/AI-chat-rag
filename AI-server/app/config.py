
"""集中管理 AI-server 运行时配置。"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]


def _get_env_str(name: str, default: str) -> str:
    """读取字符串环境变量；当值为空时回退到默认值。"""

    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip()
    return normalized or default


def _get_env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    """读取浮点环境变量，并约束到指定区间。"""

    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        value = float(raw_value)
    except ValueError:
        return default

    return min(maximum, max(minimum, value))


def _get_env_provider(name: str, default: str) -> str:
    """读取 embedding provider，非法值回退到默认 provider。"""

    value = _get_env_str(name, default).lower()
    return value if value in {"zhipu", "openai"} else default


def non_empty_str(value: object) -> str:
    """把请求配置中的字符串规整为去空白字符串；非字符串返回空串。"""

    return value.strip() if isinstance(value, str) else ""


def coerce_int(
    value: object,
    default: int,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    """从请求配置中读取整数，转换失败时回退并钳制到合法区间。"""

    if value is None or isinstance(value, bool):
        return default

    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = int(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError, OverflowError):
            return default

    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def coerce_float(
    value: object,
    default: float,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    """从请求配置中读取浮点数，转换失败时回退并钳制到合法区间。"""

    if value is None or isinstance(value, bool):
        return default

    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        return default

    if not math.isfinite(parsed):
        return default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


@dataclass(frozen=True)
class Settings:
    """从环境变量读取并冻结运行时配置。"""

    host: str = _get_env_str("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    node_base_url: str = _get_env_str("NODE_BASE_URL", "http://127.0.0.1:3001/v1")
    ai_service_secret: str = _get_env_str("AI_SERVICE_SHARED_SECRET", "")
    chroma_persist_directory: str = str(
        Path(_get_env_str("CHROMA_PERSIST_DIRECTORY", str(BASE_DIR / "ai_chroma"))).expanduser()
    )
    chroma_collection_name: str = _get_env_str(
        "CHROMA_COLLECTION_NAME", "knowledge_chunks"
    )
    zhipu_api_key: str = _get_env_str("ZHIPUAI_API_KEY", "")
    openai_api_key: str = _get_env_str("OPENAI_API_KEY", "")
    openai_base_url: str = _get_env_str("OPENAI_BASE_URL", "")
    openai_chat_model: str = _get_env_str("OPENAI_CHAT_MODEL", "")
    # embedding 的环境兜底值；Node 后台配置缺失或为空时使用这些默认值。
    embedding_provider: str = _get_env_provider("EMBEDDING_PROVIDER", "zhipu")
    zhipu_embedding_model: str = _get_env_str("ZHIPUAI_EMBEDDING_MODEL", "embedding-3")
    openai_embedding_model: str = _get_env_str(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )
    chat_retrieval_top_k: int = max(1, int(os.getenv("CHAT_RETRIEVAL_TOP_K", "5")))
    chat_retrieval_score_threshold: float = _get_env_float(
        "CHAT_RETRIEVAL_SCORE_THRESHOLD", 0.35, 0.0, 1.0
    )
    chat_context_message_limit: int = max(1, int(os.getenv("CHAT_CONTEXT_MESSAGE_LIMIT", "8")))
    chunk_size: int = int(os.getenv("INGEST_CHUNK_SIZE", "800"))
    chunk_overlap: int = int(os.getenv("INGEST_CHUNK_OVERLAP", "120"))
    embedding_batch_size: int = max(1, int(os.getenv("EMBEDDING_BATCH_SIZE", "64")))
    callback_timeout_seconds: float = float(
        os.getenv("NODE_CALLBACK_TIMEOUT_SECONDS", "10")
    )

    def __post_init__(self) -> None:
        """启动时校验强制配置，缺失密钥时拒绝提供服务。"""

        secret = (self.ai_service_secret or "").strip()
        object.__setattr__(self, "ai_service_secret", secret)
        if not secret:
            raise ValueError(
                "AI_SERVICE_SHARED_SECRET is required and must not be empty"
            )


# 在导入阶段完成一次配置解析，供各模块直接复用。
settings = Settings()
