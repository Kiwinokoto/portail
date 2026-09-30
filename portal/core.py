from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("PORTAIL_DATA_DIR", PROJECT_ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "portail.sqlite3"
HOST = os.environ.get("PORTAIL_HOST", "0.0.0.0")
PORT = int(os.environ.get("PORTAIL_PORT", "8080"))
PUBLIC_URL = os.environ.get("PORTAIL_PUBLIC_URL", "http://localhost:8080").rstrip("/")
APP_SECRET = os.environ.get("PORTAIL_APP_SECRET", "dev-only-change-me")
SESSION_TTL_DAYS = int(os.environ.get("PORTAIL_SESSION_TTL_DAYS", "30"))
SESSION_COOKIE = "portail_session"
MAX_BODY = 64 * 1024


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    return (dt or utc_now()).isoformat(timespec="seconds")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clean_text(value: object, *, label: str, max_len: int, required: bool = True) -> str:
    text = " ".join(str(value or "").split()).strip()
    if required and not text:
        raise ValueError(f"{label} est obligatoire.")
    if len(text) > max_len or any(ord(ch) < 32 for ch in text):
        raise ValueError(f"{label} est invalide.")
    return text


def join_signature(session_id: str) -> str:
    digest = hmac.new(APP_SECRET.encode(), session_id.encode(), hashlib.sha256).hexdigest()
    return digest[:32]


def signed_join_token(session_id: str) -> str:
    return f"{session_id}.{join_signature(session_id)}"


def signed_join_url(session_id: str) -> str:
    return f"{PUBLIC_URL}/?join={signed_join_token(session_id)}"


def verify_join_token(token: str) -> str | None:
    if "." not in token:
        return None
    session_id, supplied = token.rsplit(".", 1)
    if not session_id or not supplied:
        return None
    expected = join_signature(session_id)
    return session_id if hmac.compare_digest(expected, supplied) else None
