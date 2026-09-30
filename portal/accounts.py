from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from .core import SESSION_TTL_DAYS, clean_text, hash_token, iso, utc_now


class AccountsMixin:
    def create_user(self, display_name: str, role: str = "teacher") -> tuple[dict, str]:
        if role not in {"admin", "teacher"}:
            raise ValueError("Rôle invalide.")
        display_name = clean_text(display_name, label="Nom", max_len=80)
        token = secrets.token_urlsafe(32)
        now = iso()
        with self.connect() as db:
            cur = db.execute(
                "INSERT INTO users(display_name,role,token_hash,created_at,updated_at) VALUES(?,?,?,?,?)",
                (display_name, role, hash_token(token), now, now),
            )
            user_id = cur.lastrowid
        return self.get_user(user_id), token

    def count_users(self) -> int:
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM users").fetchone()[0])

    def get_user(self, user_id: int) -> dict:
        with self.connect() as db:
            row = db.execute(
                "SELECT id,display_name,role,active,created_at,updated_at FROM users WHERE id=?",
                (user_id,),
            ).fetchone()
        if not row:
            raise ValueError("Utilisateur introuvable.")
        return dict(row)

    def list_users(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT id,display_name,role,active,created_at,updated_at FROM users ORDER BY display_name COLLATE NOCASE"
            ).fetchall()
        return [dict(row) for row in rows]

    def authenticate_token(self, token: str) -> dict | None:
        if not token:
            return None
        with self.connect() as db:
            row = db.execute(
                "SELECT id,display_name,role,active,created_at,updated_at FROM users WHERE token_hash=? AND active=1",
                (hash_token(token),),
            ).fetchone()
        return dict(row) if row else None

    def rotate_user_token(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        with self.connect() as db:
            cur = db.execute(
                "UPDATE users SET token_hash=?,updated_at=? WHERE id=?",
                (hash_token(token), iso(), user_id),
            )
            if cur.rowcount != 1:
                raise ValueError("Utilisateur introuvable.")
            db.execute("DELETE FROM browser_sessions WHERE user_id=?", (user_id,))
        return token

    def set_user_active(self, user_id: int, active: bool) -> dict:
        with self.connect() as db:
            cur = db.execute(
                "UPDATE users SET active=?,updated_at=? WHERE id=?",
                (1 if active else 0, iso(), user_id),
            )
            if cur.rowcount != 1:
                raise ValueError("Utilisateur introuvable.")
            if not active:
                db.execute("DELETE FROM browser_sessions WHERE user_id=?", (user_id,))
        return self.get_user(user_id)

    def create_browser_session(self, user_id: int) -> tuple[str, datetime]:
        raw = secrets.token_urlsafe(32)
        expires = utc_now() + timedelta(days=SESSION_TTL_DAYS)
        with self.connect() as db:
            db.execute("DELETE FROM browser_sessions WHERE expires_at < ?", (iso(),))
            db.execute(
                "INSERT INTO browser_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                (hash_token(raw), user_id, iso(expires), iso()),
            )
        return raw, expires

    def user_from_browser_session(self, raw_token: str) -> dict | None:
        if not raw_token:
            return None
        with self.connect() as db:
            row = db.execute(
                """SELECT u.id,u.display_name,u.role,u.active,u.created_at,u.updated_at
                FROM browser_sessions s JOIN users u ON u.id=s.user_id
                WHERE s.token_hash=? AND s.expires_at>? AND u.active=1""",
                (hash_token(raw_token), iso()),
            ).fetchone()
        return dict(row) if row else None

    def delete_browser_session(self, raw_token: str) -> None:
        if not raw_token:
            return
        with self.connect() as db:
            db.execute("DELETE FROM browser_sessions WHERE token_hash=?", (hash_token(raw_token),))
