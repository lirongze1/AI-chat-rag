"""动态模型配置单测：LLM 覆盖与 embedding provider 选择，仅依赖标准库。"""

from __future__ import annotations

import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ["AI_SERVICE_SHARED_SECRET"] = "unit-test-secret"
try:
    import dotenv  # noqa: F401
except ImportError:
    _dotenv_stub = types.ModuleType("dotenv")
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = _dotenv_stub

from app.chat import llm as llm_module  # noqa: E402
from app.knowledge_base import embedding_model as embedding_module  # noqa: E402


class _FakeClient:
    """记录构造参数的最小 SDK 替身。"""

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs


class ChatLLMConfigTests(unittest.TestCase):
    """验证 modelConfig 覆盖环境变量与缺字段回退。"""

    def _run_create(
        self,
        config: dict | None,
        settings: SimpleNamespace,
    ) -> _FakeClient:
        fake_sdk = types.ModuleType("langchain_openai")
        fake_sdk.ChatOpenAI = _FakeClient  # type: ignore[attr-defined]
        with patch.dict(sys.modules, {"langchain_openai": fake_sdk}), patch.object(
            llm_module, "settings", settings
        ):
            return llm_module.create_chat_llm(config)

    def test_config_overrides_environment(self) -> None:
        settings = SimpleNamespace(
            openai_api_key="env-key",
            openai_chat_model="env-model",
            openai_base_url="",
        )
        client = self._run_create(
            {
                "apiKey": "admin-key",
                "baseUrl": " https://api.example.com/v1 ",
                "model": "admin-model",
                "temperature": "0.7",
            },
            settings,
        )
        self.assertEqual(client.kwargs["api_key"], "admin-key")
        self.assertEqual(client.kwargs["model"], "admin-model")
        self.assertEqual(client.kwargs["base_url"], "https://api.example.com/v1")
        self.assertEqual(client.kwargs["temperature"], 0.7)

    def test_empty_config_falls_back_to_environment(self) -> None:
        settings = SimpleNamespace(
            openai_api_key="env-key",
            openai_chat_model="env-model",
            openai_base_url="",
        )
        client = self._run_create(
            {"apiKey": "", "baseUrl": "", "model": "", "temperature": None},
            settings,
        )
        self.assertEqual(client.kwargs["api_key"], "env-key")
        self.assertEqual(client.kwargs["model"], "env-model")
        self.assertIsNone(client.kwargs["base_url"])
        self.assertEqual(client.kwargs["temperature"], 0.2)

    def test_missing_api_key_raises_clear_error(self) -> None:
        settings = SimpleNamespace(
            openai_api_key="",
            openai_chat_model="env-model",
            openai_base_url="",
        )
        with self.assertRaises(RuntimeError) as context:
            self._run_create(None, settings)
        self.assertIn("OPENAI_API_KEY", str(context.exception))


class EmbeddingProviderTests(unittest.TestCase):
    """验证 zhipu/openai provider 选择与指纹生成。"""

    def setUp(self) -> None:
        self.settings = SimpleNamespace(
            embedding_provider="zhipu",
            zhipu_embedding_model="embedding-3",
            zhipu_api_key="env-zhipu-key",
            openai_embedding_model="text-embedding-3-small",
            openai_api_key="env-openai-key",
            openai_base_url="",
            chroma_collection_name="knowledge_chunks",
            chroma_persist_directory="",
        )
        self.zhipu_sdk = types.ModuleType("langchain_community")
        self.zhipu_embeddings = types.ModuleType("langchain_community.embeddings")
        self.zhipu_embeddings.ZhipuAIEmbeddings = _FakeClient  # type: ignore[attr-defined]
        self.openai_sdk = types.ModuleType("langchain_openai")
        self.openai_sdk.OpenAIEmbeddings = _FakeClient  # type: ignore[attr-defined]

    def _create(self, config: dict | None) -> _FakeClient:
        with patch.dict(
            sys.modules,
            {
                "langchain_community": self.zhipu_sdk,
                "langchain_community.embeddings": self.zhipu_embeddings,
                "langchain_openai": self.openai_sdk,
            },
        ), patch.object(embedding_module, "settings", self.settings):
            return embedding_module.create_embedding_model(config)

    def test_zhipu_default_and_openai_override(self) -> None:
        default_client = self._create(None)
        self.assertEqual(default_client.kwargs["model"], "embedding-3")
        self.assertEqual(default_client.kwargs["api_key"], "env-zhipu-key")

        openai_client = self._create(
            {
                "provider": "openai",
                "apiKey": "admin-openai-key",
                "model": "text-embedding-3-large",
                "baseUrl": "",
            }
        )
        self.assertEqual(openai_client.kwargs["model"], "text-embedding-3-large")
        self.assertEqual(openai_client.kwargs["api_key"], "admin-openai-key")
        self.assertIsNone(openai_client.kwargs["base_url"])

    def test_fingerprint_and_collection_name(self) -> None:
        with patch.object(embedding_module, "settings", self.settings):
            self.assertEqual(
                embedding_module.embedding_fingerprint(None), "zhipu:embedding-3"
            )
            self.assertEqual(
                embedding_module.embedding_fingerprint(
                    {"provider": "openai", "model": "text-embedding-3-large"}
                ),
                "openai:text-embedding-3-large",
            )
            # 非法 provider 回退 zhipu，避免生成无法匹配的指纹。
            self.assertEqual(
                embedding_module.embedding_fingerprint({"provider": "bogus"}),
                "zhipu:embedding-3",
            )
            self.assertEqual(
                embedding_module.effective_collection_name(), "knowledge_chunks"
            )

    def test_missing_api_key_raises_clear_error(self) -> None:
        empty_settings = SimpleNamespace(
            embedding_provider="zhipu",
            zhipu_embedding_model="embedding-3",
            zhipu_api_key="",
            openai_embedding_model="text-embedding-3-small",
            openai_api_key="",
            openai_base_url="",
        )
        with patch.object(embedding_module, "settings", empty_settings):
            with self.assertRaises(RuntimeError) as context:
                embedding_module.create_embedding_model(None)
            self.assertIn("ZHIPUAI_API_KEY", str(context.exception))


if __name__ == "__main__":
    unittest.main()
