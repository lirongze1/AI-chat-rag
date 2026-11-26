"""回调签名生成的轻量单测，仅依赖标准库。"""

from __future__ import annotations

import hashlib
import hmac
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.knowledge_base.callback_signature import (  # noqa: E402
    build_callback_signature,
    build_signed_headers,
    dumps_canonical,
)


class CallbackSignatureTests(unittest.TestCase):
    """验证规范化序列化与 HMAC-SHA256 签名规则。"""

    def test_canonical_json_is_compact_and_keeps_unicode(self) -> None:
        self.assertEqual(
            dumps_canonical({"b": 1, "a": "中文"}),
            '{"b":1,"a":"中文"}',
        )

    def test_signature_matches_hmac_sha256_hex(self) -> None:
        secret = "shared-secret"
        timestamp = "1730000000"
        raw_body = '{"taskId":"t-1","status":"success"}'
        expected = hmac.new(
            secret.encode("utf-8"),
            f"{timestamp}.{raw_body}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        self.assertEqual(
            build_callback_signature(secret, timestamp, raw_body),
            expected,
        )

    def test_signed_headers_bind_signature_to_exact_body(self) -> None:
        raw_body = '{"a":"中文"}'
        headers = build_signed_headers("secret", raw_body)

        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["x-ai-service-secret"], "secret")
        self.assertTrue(headers["x-ai-timestamp"].isdigit())
        self.assertEqual(
            headers["x-ai-signature"],
            build_callback_signature("secret", headers["x-ai-timestamp"], raw_body),
        )
        self.assertNotEqual(
            headers["x-ai-signature"],
            build_callback_signature("secret", headers["x-ai-timestamp"], raw_body + " "),
        )


if __name__ == "__main__":
    unittest.main()
