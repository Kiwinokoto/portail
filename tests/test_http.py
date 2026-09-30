import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
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

    def request(self, path, *, method="GET", payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Origin": self.base},
        )
        with self.client.open(req, timeout=3) as response:
            return response.status, json.loads(response.read())

    def login(self):
        status, payload = self.request("/api/auth/login", method="POST", payload={"token": self.admin_token})
        self.assertEqual(200, status)
        return payload

    def test_health_and_login_catalog(self):
        status, payload = self.request("/healthz")
        self.assertEqual(200, status)
        self.assertTrue(payload["ok"])
        self.login()
        status, payload = self.request("/api/catalog")
        self.assertEqual(200, status)
        self.assertEqual(["psr", "ada"], [f["id"] for f in payload["formations"]])

    def test_create_session_and_public_join_resolution(self):
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
        join_url = payload["session"]["join_url"]
        token = join_url.split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        req = urllib.request.Request(self.base + "/api/join?token=" + token)
        with anonymous.open(req, timeout=3) as response:
            joined = json.loads(response.read())
        self.assertEqual("ADA", joined["session"]["formation_label"])
        self.assertEqual("Français", joined["session"]["subject_label"])

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

    def test_unauthenticated_catalog_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/catalog")
        self.assertEqual(401, ctx.exception.code)


if __name__ == "__main__":
    unittest.main()
