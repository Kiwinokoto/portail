import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer

os.environ.setdefault("PORTAIL_APP_SECRET", "test-secret")
os.environ.setdefault("PORTAIL_PUBLIC_URL", "http://localhost:8080")

import server  # noqa: E402


class PortalHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.original_store = server.STORE
        server.STORE = server.PortalStore(Path(cls.tmp.name) / "portal.sqlite3")
        server.STORE.init()
        cls.admin, cls.admin_token = server.STORE.create_user("Kevin", "admin")
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        server.STORE = cls.original_store
        cls.tmp.cleanup()

    def setUp(self):
        jar = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request(self, path, *, method="GET", payload=None, opener=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Origin": self.base},
        )
        with (opener or self.client).open(req, timeout=3) as response:
            return response.status, json.loads(response.read())

    def login(self):
        status, payload = self.request("/api/auth/login", method="POST", payload={"token": self.admin_token})
        self.assertEqual(200, status)
        return payload

    def create_ada_session(self):
        self.login()
        status, payload = self.request(
            "/api/sessions",
            method="POST",
            payload={
                "formation_id": "ada",
                "subject_id": "ada-francais",
                "session_number": 1,
                "title": "Prénom et sons",
                "group_label": "ADA 1",
            },
        )
        self.assertEqual(201, status)
        return payload["session"]

    def test_health_and_login_catalog(self):
        status, payload = self.request("/healthz")
        self.assertEqual(200, status)
        self.assertTrue(payload["ok"])
        self.login()
        status, payload = self.request("/api/catalog")
        self.assertEqual(200, status)
        self.assertEqual(["psr", "ada"], [f["id"] for f in payload["formations"]])

    def test_create_session_and_public_join_resolution(self):
        session = self.create_ada_session()
        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        status, joined = self.request(
            "/api/join?token=" + urllib.parse.quote(token),
            opener=anonymous,
        )
        self.assertEqual(200, status)
        self.assertEqual("ADA", joined["session"]["formation_label"])
        self.assertEqual("Français", joined["session"]["subject_label"])

    def test_teacher_preloads_roster_and_public_selection_feeds_live_view(self):
        session = self.create_ada_session()
        status, roster = self.request(
            f"/api/sessions/{session['id']}/learners",
            method="POST",
            payload={
                "learners": [
                    {"first_name": "Amina", "last_name": "Diallo"},
                    {"first_name": "Moussa", "last_name": "Traoré"},
                ]
            },
        )
        self.assertEqual(201, status)
        self.assertEqual(2, roster["created"])

        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        status, public = self.request(
            "/api/join/roster?token=" + urllib.parse.quote(token),
            opener=anonymous,
        )
        self.assertEqual(200, status)
        self.assertEqual(2, len(public["learners"]))
        self.assertEqual("D.", public["learners"][0]["last_initial"])
        self.assertNotIn("last_name", public["learners"][0])

        selected_id = public["learners"][0]["id"]
        status, joined = self.request(
            "/api/join/learners",
            method="POST",
            payload={"token": token, "learner_id": selected_id},
            opener=anonymous,
        )
        self.assertEqual(201, status)
        self.assertEqual("Amina", joined["learner"]["first_name"])
        self.assertEqual("D.", joined["learner"]["last_initial"])
        self.assertNotIn("last_name", joined["learner"])

        status, _ = self.request(
            "/api/join/events",
            method="POST",
            payload={
                "token": token,
                "learner_id": selected_id,
                "event_type": "activity_started",
                "item_id": "positioning-v1",
                "payload": {"entry": "roster"},
            },
            opener=anonymous,
        )
        self.assertEqual(201, status)

        status, activity = self.request(f"/api/sessions/{session['id']}/activity")
        self.assertEqual(200, status)
        self.assertEqual(1, activity["started_count"])
        amina = next(learner for learner in activity["learners"] if learner["first_name"] == "Amina")
        self.assertTrue(amina["started"])

    def test_public_cannot_create_unlisted_learner_by_typing_name(self):
        session = self.create_ada_session()
        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/join/learners",
                method="POST",
                payload={"token": token, "first_name": "Amina"},
                opener=anonymous,
            )
        self.assertEqual(400, ctx.exception.code)

    def test_admin_can_create_teacher_but_token_is_one_time_response(self):
        self.login()
        status, payload = self.request(
            "/api/admin/users",
            method="POST",
            payload={"display_name": "Fadhila", "role": "teacher"},
        )
        self.assertEqual(201, status)
        self.assertTrue(payload["token"])
        _, users = self.request("/api/admin/users")
        saved = next(u for u in users["users"] if u["display_name"] == "Fadhila")
        self.assertNotIn("token", saved)
        self.assertNotIn("token_hash", saved)

    def test_sso_redeem_rejects_unknown_code(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/sso/redeem",
                method="POST",
                payload={"target": "maths", "code": "unknown", "verifier": "unknown"},
            )
        self.assertEqual(401, ctx.exception.code)

    def test_unauthenticated_catalog_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/catalog")
        self.assertEqual(401, ctx.exception.code)


if __name__ == "__main__":
    unittest.main()
