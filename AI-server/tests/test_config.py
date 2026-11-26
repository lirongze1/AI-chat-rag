"""配置启动校验与范围钳制的轻量单测，仅依赖标准库。"""

from __future__ import annotations

import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# config 在导入阶段就会实例化 Settings，先满足必填密钥并兼容缺失的 dotenv。
os.environ["AI_SERVICE_SHARED_SECRET"] = "unit-test-secret"
try:
    import dotenv  # noqa: F401
except ImportError:
    _dotenv_stub = types.ModuleType("dotenv")
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = _dotenv_stub

from app.config import Settings, _get_env_float  # noqa: E402


class ConfigTests(unittest.TestCase):
    """验证共享密钥必填与既有钳制风格。"""

    def test_empty_shared_secret_is_rejected(self) -> None:
        for invalid in ("", "   "):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                Settings(ai_service_secret=invalid)

    def test_non_empty_shared_secret_is_accepted(self) -> None:
        settings = Settings(ai_service_secret="shared-secret")
        self.assertEqual(settings.ai_service_secret, "shared-secret")

    def test_float_env_value_is_clamped(self) -> None:
        with patch.dict(os.environ, {"TEST_FLOAT_VALUE": "5"}):
            self.assertEqual(_get_env_float("TEST_FLOAT_VALUE", 0.35, 0.0, 1.0), 1.0)
        with patch.dict(os.environ, {"TEST_FLOAT_VALUE": "-5"}):
            self.assertEqual(_get_env_float("TEST_FLOAT_VALUE", 0.35, 0.0, 1.0), 0.0)


if __name__ == "__main__":
    unittest.main()
