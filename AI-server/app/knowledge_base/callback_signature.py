"""生成回调请求的规范化 JSON 与签名。

此模块只依赖标准库，便于在无需安装 HTTP / Pydantic 依赖的情况下单测，
同时保证 Python 侧序列化结果与 Node 侧校验规则完全一致。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any


def dumps_canonical(value: Any) -> str:
    """按回调约定序列化 JSON：紧凑分隔符、不转义非 ASCII 字符。"""

    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def build_callback_signature(secret: str, timestamp: str, raw_body: str) -> str:
    """计算 HMAC-SHA256(`${timestamp}.${raw_body}`) 的十六进制摘要。"""

    message = f"{timestamp}.{raw_body}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def build_signed_headers(secret: str, raw_body: str) -> dict[str, str]:
    """构造回调请求头，时间戳取当前 unix 秒字符串。"""

    timestamp = str(int(time.time()))
    return {
        "Content-Type": "application/json",
        # 保留原有密钥头，兼容尚未升级签名校验的 Node 版本。
        "x-ai-service-secret": secret,
        "x-ai-timestamp": timestamp,
        "x-ai-signature": build_callback_signature(secret, timestamp, raw_body),
    }
