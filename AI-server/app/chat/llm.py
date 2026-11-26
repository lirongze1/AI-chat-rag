"""封装聊天业务中的 LLM 客户端创建逻辑。"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.config import coerce_float, non_empty_str, settings

if TYPE_CHECKING:
    from langchain_openai import ChatOpenAI


def create_chat_llm(config: dict[str, Any] | None = None) -> "ChatOpenAI":
    """创建聊天业务使用的 LangChain ChatOpenAI 客户端。

    config 来自管理员后台配置；字段为空或缺失时回退到 settings 中的环境变量。
    """

    config = config if isinstance(config, dict) else {}

    api_key = non_empty_str(config.get("apiKey")) or settings.openai_api_key
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is required for chat; set it in env or provide modelConfig.apiKey"
        )

    model = non_empty_str(config.get("model")) or settings.openai_chat_model
    base_url = non_empty_str(config.get("baseUrl")) or non_empty_str(
        settings.openai_base_url
    ) or None
    temperature = coerce_float(config.get("temperature"), 0.2, 0.0, 2.0)

    # 延迟导入，避免仅解析配置时依赖可选的重型 SDK。
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=api_key,
        base_url=base_url,
    )
