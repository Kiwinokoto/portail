#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from portal.core import (
    APP_SECRET, HOST, MAX_BODY, PORT, PROJECT_ROOT, PUBLIC_URL, SESSION_COOKIE,
    clean_text, hash_token, signed_join_token, signed_join_url, utc_now, verify_join_token,
)
from portal.store import PortalStore

ROOT = PROJECT_ROOT
STORE = PortalStore()


class Handler(BaseHTTPRequestHandler):
    server_version = "PortailLGC/0.1"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, status: int, payload: object, *, cookie: str | None = None) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > MAX_BODY:
            raise ValueError("Requête trop volumineuse.")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("JSON invalide.") from exc
        if not isinstance(payload, dict):
            raise ValueError("Objet JSON attendu.")
        return payload

    def _cookie_token(self) -> str:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def _user(self) -> dict | None:
        return STORE.user_from_browser_session(self._cookie_token())

    def _require_user(self) -> dict:
        user = self._user()
        if not user:
            raise PermissionError("Authentification requise.")
        return user

    def _require_admin(self) -> dict:
        user = self._require_user()
        if user["role"] != "admin":
            raise PermissionError("Accès administrateur requis.")
        return user

    def _check_origin(self) -> None:
        origin = self.headers.get("Origin")
        if not origin:
            return
        origin = origin.rstrip("/")
        host = self.headers.get("Host", "").strip()
        allowed = {PUBLIC_URL}
        if host:
            allowed.update({f"http://{host}", f"https://{host}"})
        if origin not in allowed:
            raise PermissionError("Origine refusée.")

    @staticmethod
    def _session_from_join_token(token: str) -> dict:
        session_id = verify_join_token(token)
        if not session_id:
            raise ValueError("Lien de séance invalide.")
        session = STORE.get_class_session(session_id)
        if not session["active"]:
            raise ValueError("Cette séance est fermée.")
        return session

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/healthz":
                return self._json(HTTPStatus.OK, {"ok": True})
            if path == "/api/me":
                user = self._user()
                return self._json(HTTPStatus.OK, {"user": user})
            if path == "/api/catalog":
                user = self._require_user()
                return self._json(HTTPStatus.OK, {"formations": STORE.catalog_for(user)})
            if path == "/api/sessions":
                user = self._require_user()
                return self._json(HTTPStatus.OK, {"sessions": STORE.list_class_sessions(user["id"])})
            if path == "/api/admin/users":
                self._require_admin()
                return self._json(HTTPStatus.OK, {"users": STORE.list_users()})
            if path == "/api/join":
                query = parse_qs(parsed.query)
                token = (query.get("token") or [""])[0]
                session_id = verify_join_token(token)
                if not session_id:
                    return self._json(HTTPStatus.NOT_FOUND, {"error": "Lien de séance invalide."})
                session = STORE.get_class_session(session_id)
                if not session["active"]:
                    return self._json(HTTPStatus.GONE, {"error": "Cette séance est fermée."})
                return self._json(HTTPStatus.OK, {"session": session})
            if path == "/api/join/roster":
                query = parse_qs(parsed.query)
                session = self._session_from_join_token((query.get("token") or [""])[0])
                return self._json(
                    HTTPStatus.OK,
                    {"learners": STORE.public_roster(session["id"])},
                )
            if path.startswith("/api/sessions/") and path.endswith("/learners"):
                user = self._require_user()
                session_id = path.split("/")[3]
                return self._json(
                    HTTPStatus.OK,
                    {"learners": STORE.list_roster(session_id, user["id"])},
                )
            if path.startswith("/api/sessions/") and path.endswith("/activity"):
                user = self._require_user()
                session_id = path.split("/")[3]
                return self._json(HTTPStatus.OK, STORE.session_activity(session_id, user["id"]))
            if path.startswith("/api/sessions/") and path.endswith("/qr.svg"):
                user = self._require_user()
                session_id = path.split("/")[3]
                session = STORE.get_class_session(session_id, teacher_id=user["id"])
                return self._qr_svg(session["join_url"])
            return self._serve_static(path)
        except PermissionError as exc:
            return self._json(HTTPStatus.UNAUTHORIZED, {"error": str(exc)})
        except ValueError as exc:
            return self._json(HTTPStatus.NOT_FOUND, {"error": str(exc)})
        except Exception:
            return self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Erreur serveur."})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            self._check_origin()
            payload = self._read_json()
            if path == "/api/auth/login":
                user = STORE.authenticate_token(str(payload.get("token") or "").strip())
                if not user:
                    return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès invalide."})
                raw, expires = STORE.create_browser_session(user["id"])
                cookie = self._session_cookie(raw, expires)
                return self._json(HTTPStatus.OK, {"user": user}, cookie=cookie)
            if path == "/api/auth/logout":
                STORE.delete_browser_session(self._cookie_token())
                return self._json(HTTPStatus.OK, {"ok": True}, cookie=self._clear_cookie())
            if path == "/api/join/learners":
                session = self._session_from_join_token(str(payload.get("token") or ""))
                learner_id = clean_text(
                    payload.get("learner_id"),
                    label="Élève",
                    max_len=64,
                )
                learner = STORE.register_learner(
                    session["id"],
                    learner_id=learner_id,
                    first_name="",
                )
                public_learner = {
                    "id": learner["id"],
                    "class_session_id": learner["class_session_id"],
                    "first_name": learner["first_name"],
                    "last_initial": f"{learner['last_name'][0].upper()}." if learner["last_name"] else "",
                }
                return self._json(HTTPStatus.CREATED, {"learner": public_learner})
            if path == "/api/join/events":
                session = self._session_from_join_token(str(payload.get("token") or ""))
                event = STORE.record_activity_event(
                    session["id"],
                    learner_id=clean_text(payload.get("learner_id"), label="Élève", max_len=64),
                    event_type=str(payload.get("event_type") or ""),
                    item_id=payload.get("item_id") or "",
                    payload=payload.get("payload") if "payload" in payload else {},
                )
                return self._json(HTTPStatus.CREATED, {"event": event})
            if path == "/api/sessions":
                user = self._require_user()
                session = STORE.create_class_session(
                    teacher_id=user["id"],
                    formation_id=clean_text(payload.get("formation_id"), label="Formation", max_len=64),
                    subject_id=clean_text(payload.get("subject_id"), label="Matière", max_len=64),
                    session_number=int(payload.get("session_number") or 0),
                    title=payload.get("title") or "",
                    group_label=payload.get("group_label") or "",
                )
                return self._json(HTTPStatus.CREATED, {"session": session})
            if path.startswith("/api/sessions/") and path.endswith("/learners"):
                user = self._require_user()
                session_id = path.split("/")[3]
                result = STORE.add_roster_learners(
                    session_id,
                    user["id"],
                    payload.get("learners"),
                )
                return self._json(HTTPStatus.CREATED, result)
            if path.startswith("/api/sessions/") and path.endswith("/corrections"):
                user = self._require_user()
                session_id = path.split("/")[3]
                session = STORE.set_corrections(
                    session_id,
                    user["id"],
                    bool(payload.get("unlocked")),
                )
                return self._json(HTTPStatus.OK, {"session": session})
            if path == "/api/admin/users":
                self._require_admin()
                created, token = STORE.create_user(
                    display_name=payload.get("display_name") or "",
                    role=str(payload.get("role") or "teacher"),
                )
                return self._json(HTTPStatus.CREATED, {"user": created, "token": token})
            if path.startswith("/api/admin/users/") and path.endswith("/rotate-token"):
                current = self._require_admin()
                user_id = int(path.split("/")[4])
                if user_id == current["id"]:
                    raise ValueError("La régénération de ton propre accès sera ajoutée avec un flux de reconnexion dédié.")
                token = STORE.rotate_user_token(user_id)
                return self._json(HTTPStatus.OK, {"token": token})
            if path.startswith("/api/admin/users/") and path.endswith("/active"):
                current = self._require_admin()
                user_id = int(path.split("/")[4])
                active = bool(payload.get("active"))
                if user_id == current["id"] and not active:
                    raise ValueError("Tu ne peux pas désactiver ton propre compte.")
                user = STORE.set_user_active(user_id, active)
                return self._json(HTTPStatus.OK, {"user": user})
            return self._json(HTTPStatus.NOT_FOUND, {"error": "Route introuvable."})
        except PermissionError as exc:
            return self._json(HTTPStatus.UNAUTHORIZED, {"error": str(exc)})
        except (ValueError, TypeError) as exc:
            return self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception:
            return self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Erreur serveur."})

    def _session_cookie(self, raw: str, expires: datetime) -> str:
        secure = "; Secure" if PUBLIC_URL.startswith("https://") else ""
        max_age = max(1, int((expires - utc_now()).total_seconds()))
        return f"{SESSION_COOKIE}={raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}"

    def _clear_cookie(self) -> str:
        secure = "; Secure" if PUBLIC_URL.startswith("https://") else ""
        return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{secure}"

    def _qr_svg(self, value: str) -> None:
        try:
            import qrcode
            from qrcode.image.svg import SvgPathImage
        except ImportError:
            return self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "QR indisponible."})
        image = qrcode.make(value, image_factory=SvgPathImage, box_size=8, border=4)
        data = image.to_string()
        body = data.encode() if isinstance(data, str) else data
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "image/svg+xml")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, path: str) -> None:
        if path == "/":
            target = ROOT / "index.html"
        elif path.startswith("/assets/"):
            target = (ROOT / path.lstrip("/")).resolve()
            assets_root = (ROOT / "assets").resolve()
            if assets_root not in target.parents:
                raise ValueError("Fichier introuvable.")
        else:
            raise ValueError("Page introuvable.")
        if not target.is_file():
            raise ValueError("Fichier introuvable.")
        body = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") else mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def init_admin(name: str) -> int:
    STORE.init()
    if STORE.count_users() > 0:
        print("Un utilisateur existe déjà; utilise le back-office pour gérer les comptes.", file=sys.stderr)
        return 2
    user, token = STORE.create_user(name, "admin")
    print(f"Admin créé : {user['display_name']}")
    print("Token (affiché une seule fois) :")
    print(token)
    return 0


def serve() -> None:
    if PUBLIC_URL.startswith("https://") and APP_SECRET == "dev-only-change-me":
        raise SystemExit("PORTAIL_APP_SECRET doit être défini en production.")
    STORE.init()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Portail LGC sur http://{HOST}:{PORT} — URL publique {PUBLIC_URL}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Portail pédagogique LGC")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("serve")
    init = sub.add_parser("init-admin")
    init.add_argument("--name", required=True)
    args = parser.parse_args()
    if args.command in {None, "serve"}:
        serve()
        return 0
    if args.command == "init-admin":
        return init_admin(args.name)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
