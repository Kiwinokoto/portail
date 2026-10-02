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

    def create_psr_maths_session(self):
        self.login()
        status, payload = self.request(
            "/api/sessions",
            method="POST",
            payload={
                "formation_id": "psr",
                "subject_id": "psr-maths",
                "pathway_id": "rentree-v1",
                "session_number": 1,
                "title": "Diagnostic de rentrée",
                "group_label": "PSR test",
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

    def test_learning_practice_static_assets(self):
        with urllib.request.urlopen(self.base + "/", timeout=3) as response:
            self.assertEqual(200, response.status)
            html = response.read().decode("utf-8")
        self.assertIn("/assets/learning-practice.js", html)
        self.assertLess(
            html.index("/assets/learning-practice.js"),
            html.index("/assets/app.js"),
        )

        with urllib.request.urlopen(self.base + "/assets/learning/vocabulary.json", timeout=3) as response:
            self.assertEqual(200, response.status)
            vocabulary = json.loads(response.read())
        items = vocabulary["items"]
        self.assertGreaterEqual(len(items), 8)
        ids = [item["id"] for item in items]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all("everyday" in item["tags"] for item in items))

        with urllib.request.urlopen(self.base + "/assets/learning/everyday.svg", timeout=3) as response:
            self.assertEqual(200, response.status)
            svg = response.read().decode("utf-8")
        for item in items:
            self.assertIn(f'id="{item["visual"]}"', svg)

        with urllib.request.urlopen(self.base + "/assets/learning-practice.js", timeout=3) as response:
            self.assertEqual(200, response.status)
            practice_js = response.read().decode("utf-8")
        self.assertIn("renderAdaTeacherPreviewHome", practice_js)
        self.assertIn("renderLearningMemoryPractice", practice_js)
        self.assertIn("renderCaseMemoryPractice", practice_js)
        self.assertIn("renderSyllableListeningPractice", practice_js)

        with urllib.request.urlopen(self.base + "/assets/app.js", timeout=3) as response:
            self.assertEqual(200, response.status)
            app_js = response.read().decode("utf-8")
        self.assertIn("renderTeacherWorkspaceNav", app_js)
        self.assertIn("renderPsrMathsPathwayHome", app_js)
        self.assertIn("renderPsrMathsChallenge", app_js)
        self.assertIn("PSR_MATHS_MODULES", app_js)
        self.assertIn("psr-maths-challenge-v1", app_js)
        self.assertIn("teacher-main-nav", html)

        with urllib.request.urlopen(self.base + "/assets/learning/literacy-basics.json", timeout=3) as response:
            self.assertEqual(200, response.status)
            basics = json.loads(response.read())
        self.assertGreaterEqual(len(basics["letters"]), 12)
        self.assertGreaterEqual(len(basics["syllables"]), 20)
        self.assertEqual(len(basics["letters"]), len(set(basics["letters"])))
        self.assertEqual(len(basics["syllables"]), len(set(basics["syllables"])))
        self.assertTrue(all(value == value.upper() for value in basics["letters"]))

    def test_fetch_maths_sessions_normalizes_external_contract(self):
        captured = {}
        original_urlopen = server.urllib.request.urlopen

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "sessions": [{
                        "class_session_id": "external_session_12345",
                        "session_number": 111,
                        "session_title": "Test",
                        "group_label": "Test",
                        "active": True,
                        "corrections_unlocked": False,
                        "created_at": "2026-10-01T12:02:27+00:00",
                        "updated_at": "2026-10-01T12:02:27+00:00",
                    }]
                }).encode()

        def fake_urlopen(request, timeout=0):
            captured["url"] = request.full_url
            captured["payload"] = json.loads(request.data.decode())
            captured["timeout"] = timeout
            return FakeResponse()

        server.urllib.request.urlopen = fake_urlopen
        try:
            sessions = server.fetch_maths_sessions_for_user(self.admin)
        finally:
            server.urllib.request.urlopen = original_urlopen

        self.assertEqual(1, len(sessions))
        session = sessions[0]
        self.assertEqual("maths:external_session_12345", session["id"])
        self.assertEqual("psr-maths", session["subject_id"])
        self.assertEqual("Mathématiques", session["subject_label"])
        self.assertEqual("Test", session["group_label"])
        self.assertIn("tab=live", session["manage_url"])
        self.assertIn("session=external_session_12345", session["manage_url"])
        self.assertTrue(captured["url"].endswith("/api/portal/session-summaries"))
        self.assertTrue(captured["payload"]["code"])
        self.assertGreaterEqual(len(captured["payload"]["verifier"]), 43)
        self.assertEqual(5, captured["timeout"])

    def test_external_maths_sessions_endpoint_uses_logged_in_identity(self):
        self.login()
        original_fetch = server.fetch_maths_sessions_for_user
        seen = {}

        def fake_fetch(user):
            seen["user_id"] = user["id"]
            return [{
                "id": "maths:external_session_12345",
                "external_id": "external_session_12345",
                "source": "maths",
                "formation_id": "psr",
                "formation_label": "PSR",
                "subject_id": "psr-maths",
                "subject_label": "Mathématiques",
                "session_number": 111,
                "title": "Test",
                "group_label": "Test",
                "active": True,
                "corrections_unlocked": False,
                "created_at": "2026-10-01T12:02:27+00:00",
                "updated_at": "2026-10-01T12:02:27+00:00",
                "manage_url": "https://maths.lagrandeclasse.fr/api/sso/start?tab=live&session=external_session_12345",
            }]

        server.fetch_maths_sessions_for_user = fake_fetch
        try:
            status, payload = self.request("/api/external/maths/sessions")
        finally:
            server.fetch_maths_sessions_for_user = original_fetch

        self.assertEqual(200, status)
        self.assertEqual(self.admin["id"], seen["user_id"])
        self.assertEqual("maths:external_session_12345", payload["sessions"][0]["id"])
        self.assertEqual("psr-maths", payload["sessions"][0]["subject_id"])

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
        self.assertEqual("positioning-v1", joined["session"]["pathway_id"])

    def test_teacher_can_create_practice_session_and_join_keeps_pathway(self):
        self.login()
        status, payload = self.request(
            "/api/sessions",
            method="POST",
            payload={
                "formation_id": "ada",
                "subject_id": "ada-francais",
                "pathway_id": "practice-v1",
                "session_number": 2,
                "title": "Cartes et Memory",
                "group_label": "ADA pratique",
            },
        )
        self.assertEqual(201, status)
        session = payload["session"]
        self.assertEqual("practice-v1", session["pathway_id"])

        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        status, joined = self.request(
            "/api/join?token=" + urllib.parse.quote(token),
            opener=anonymous,
        )
        self.assertEqual(200, status)
        self.assertEqual("practice-v1", joined["session"]["pathway_id"])

    def test_teacher_can_close_and_reopen_session_without_losing_history(self):
        session = self.create_ada_session()
        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()

        status, closed = self.request(
            f"/api/sessions/{session['id']}/active",
            method="POST",
            payload={"active": False},
        )
        self.assertEqual(200, status)
        self.assertFalse(closed["session"]["active"])
        self.assertFalse(closed["session"]["corrections_unlocked"])

        status, listed = self.request("/api/sessions")
        self.assertEqual(200, status)
        saved = next(item for item in listed["sessions"] if item["id"] == session["id"])
        self.assertFalse(saved["active"])

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/join?token=" + urllib.parse.quote(token),
                opener=anonymous,
            )
        self.assertEqual(410, ctx.exception.code)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/join/roster?token=" + urllib.parse.quote(token),
                opener=anonymous,
            )
        self.assertEqual(410, ctx.exception.code)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/join/learners",
                method="POST",
                payload={"token": token, "learner_id": "prepared_learner"},
                opener=anonymous,
            )
        self.assertEqual(410, ctx.exception.code)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                "/api/join/events",
                method="POST",
                payload={
                    "token": token,
                    "learner_id": "prepared_learner",
                    "event_type": "activity_started",
                    "item_id": "positioning-v1",
                    "payload": {},
                },
                opener=anonymous,
            )
        self.assertEqual(410, ctx.exception.code)

        status, reopened = self.request(
            f"/api/sessions/{session['id']}/active",
            method="POST",
            payload={"active": True},
        )
        self.assertEqual(200, status)
        self.assertTrue(reopened["session"]["active"])

        status, joined = self.request(
            "/api/join?token=" + urllib.parse.quote(token),
            opener=anonymous,
        )
        self.assertEqual(200, status)
        self.assertEqual(session["id"], joined["session"]["id"])

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

    def test_teacher_can_correct_roster_but_cannot_remove_started_learner(self):
        session = self.create_ada_session()
        status, roster = self.request(
            f"/api/sessions/{session['id']}/learners",
            method="POST",
            payload={"learners": [{"first_name": "Amina", "last_name": "Dallo"}]},
        )
        self.assertEqual(201, status)
        learner_id = roster["learners"][0]["id"]

        status, updated = self.request(
            f"/api/sessions/{session['id']}/learners/update",
            method="POST",
            payload={
                "learner_id": learner_id,
                "first_name": "Amina",
                "last_name": "Diallo",
            },
        )
        self.assertEqual(200, status)
        self.assertEqual("Diallo", updated["learner"]["last_name"])

        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()
        status, _ = self.request(
            "/api/join/events",
            method="POST",
            payload={
                "token": token,
                "learner_id": learner_id,
                "event_type": "activity_started",
                "item_id": "positioning-v1",
                "payload": {"entry": "roster"},
            },
            opener=anonymous,
        )
        self.assertEqual(201, status)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request(
                f"/api/sessions/{session['id']}/learners/remove",
                method="POST",
                payload={"learner_id": learner_id},
            )
        self.assertEqual(400, ctx.exception.code)

    def test_psr_maths_corrections_lock_is_visible_to_signed_join(self):
        session = self.create_psr_maths_session()
        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()

        status, payload = self.request(f"/api/join?token={token}", opener=anonymous)
        self.assertEqual(200, status)
        self.assertFalse(payload["session"]["corrections_unlocked"])

        status, updated = self.request(
            f"/api/sessions/{session['id']}/corrections",
            method="POST",
            payload={"unlocked": True},
        )
        self.assertEqual(200, status)
        self.assertTrue(updated["session"]["corrections_unlocked"])

        status, payload = self.request(f"/api/join?token={token}", opener=anonymous)
        self.assertEqual(200, status)
        self.assertTrue(payload["session"]["corrections_unlocked"])

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

    def test_psr_maths_native_session_tracks_unknown_answers(self):
        session = self.create_psr_maths_session()
        self.assertEqual("rentree-v1", session["pathway_id"])
        status, roster = self.request(
            f"/api/sessions/{session['id']}/learners",
            method="POST",
            payload={"learners": [{"first_name": "Amina", "last_name": "Diallo"}]},
        )
        self.assertEqual(201, status)
        learner_id = roster["learners"][0]["id"]
        token = session["join_url"].split("?join=", 1)[1]
        anonymous = urllib.request.build_opener()

        status, _ = self.request(
            "/api/join/learners",
            method="POST",
            payload={"token": token, "learner_id": learner_id},
            opener=anonymous,
        )
        self.assertEqual(201, status)

        status, _ = self.request(
            "/api/join/events",
            method="POST",
            payload={
                "token": token,
                "learner_id": learner_id,
                "event_type": "answer",
                "item_id": "psr-d01",
                "payload": {"correct": False, "unknown": True, "domain": "Calcul et prix"},
            },
            opener=anonymous,
        )
        self.assertEqual(201, status)
        status, _ = self.request(
            "/api/join/events",
            method="POST",
            payload={
                "token": token,
                "learner_id": learner_id,
                "event_type": "activity_completed",
                "item_id": "psr-d01",
                "payload": {"unknown": True},
            },
            opener=anonymous,
        )
        self.assertEqual(201, status)

        status, activity = self.request(f"/api/sessions/{session['id']}/activity")
        self.assertEqual(200, status)
        learner = activity["learners"][0]
        self.assertEqual(1, learner["attempts"])
        self.assertEqual(1, learner["unknown_answers"])
        item = next(item for item in activity["items"] if item["item_id"] == "psr-d01")
        self.assertEqual(1, item["unknown_answers"])
        self.assertEqual(1, item["completed_count"])

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
