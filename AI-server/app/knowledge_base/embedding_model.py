"""封装知识库向量化模型的创建逻辑与 embedding 指纹。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import non_empty_str, settings

_VALID_PROVIDERS = ("zhipu", "openai")
_ACTIVE_CONFIG_FILENAME = ".active_embedding.json"


def resolve_embedding_config(config: dict[str, Any] | None = None) -> dict[str, str]:
    """合并后台配置与 settings 兜底值，返回完整的 embedding 参数。"""

    config = config if isinstance(config, dict) else {}
    provider = non_empty_str(config.get("provider")).lower() or settings.embedding_provider
    if provider not in _VALID_PROVIDERS:
        provider = "zhipu"

    if provider == "zhipu":
        default_model = settings.zhipu_embedding_model
        default_key = settings.zhipu_api_key
        default_base_url = ""
    else:
        default_model = settings.openai_embedding_model
        default_key = settings.openai_api_key
        default_base_url = settings.openai_base_url

    return {
        "provider": provider,
        "model": non_empty_str(config.get("model")) or default_model,
        "apiKey": non_empty_str(config.get("apiKey")) or default_key,
        # baseUrl 为空时统一规整为空串，调用 SDK 时再转成 None。
        "baseUrl": non_empty_str(config.get("baseUrl")) or non_empty_str(default_base_url),
    }


def create_embedding_model(config: dict[str, Any] | None = None) -> Any:
    """创建知识库向量化阶段的嵌入模型客户端。

    未传 config 时保持原有 zhipu + settings.zhipu_api_key 行为。
    """

    resolved = resolve_embedding_config(config)
    provider = resolved["provider"]
    api_key = resolved["apiKey"]
    if not api_key:
        if provider == "zhipu":
            raise RuntimeError(
                "ZHIPUAI_API_KEY is required for embedding; set it in env or provide embeddingConfig.apiKey"
            )
        raise RuntimeError(
            "OPENAI_API_KEY is required for embedding (provider=openai); set it in env or provide embeddingConfig.apiKey"
        )

    # 延迟导入，避免仅解析指纹时依赖可选的重型 SDK。
    if provider == "zhipu":
        from langchain_community.embeddings import ZhipuAIEmbeddings

        return ZhipuAIEmbeddings(model=resolved["model"], api_key=api_key)

    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(
        model=resolved["model"],
        api_key=api_key,
        base_url=resolved["baseUrl"] or None,
    )


def embedding_fingerprint(config: dict[str, Any] | None = None) -> str:
    """返回 embedding 的 provider:model 指纹，用于隔离不同模型的向量。"""

    resolved = resolve_embedding_config(config)
    return f"{resolved['provider']}:{resolved['model']}"


def effective_collection_name(config: dict[str, Any] | None = None) -> str:
    """入库与检索共用同一 collection；模型差异由 metadata 指纹过滤隔离。"""

    return settings.chroma_collection_name


def _active_config_path() -> Path:
    return Path(settings.chroma_persist_directory) / _ACTIVE_CONFIG_FILENAME


def read_active_embedding_config() -> dict[str, str] | None:
    """读取最近一次成功入库使用的 embedding 配置，不包含 apiKey。"""

    try:
        payload = json.loads(_active_config_path().read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None

    if not isinstance(payload, dict):
        return None

    provider = non_empty_str(payload.get("provider")).lower()
    model = non_empty_str(payload.get("model"))
    if provider not in _VALID_PROVIDERS or not model:
        return None

    return {
        "provider": provider,
        "model": model,
        "baseUrl": non_empty_str(payload.get("baseUrl")),
    }


def write_active_embedding_config(config: dict[str, Any] | None = None) -> None:
    """入库成功后记录当前生效的 embedding 配置，供检索端复用与过滤。"""

    resolved = resolve_embedding_config(config)
    data = {
        "provider": resolved["provider"],
        "model": resolved["model"],
        "baseUrl": resolved["baseUrl"],
    }
    path = _active_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
