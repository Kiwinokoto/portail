import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("PORTAIL_APP_SECRET", "test-secret")
os.environ.setdefault("PORTAIL_PUBLIC_URL", "http://localhost:8080")

import server  # noqa: E402


class PortalStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = server.PortalStore(Path(self.tmp.name) / "portal.sqlite3")
        self.store.init()

    def tearDown(self):
        self.tmp.cleanup()

    def test_seed_catalog_has_psr_and_ada(self):
        admin, _ = self.store.create_user("Kevin", "admin")
        catalog = self.store.catalog_for(admin)
        by_id = {item["id"]: item for item in catalog}
        self.assertEqual({"psr", "ada"}, set(by_id))
        self.assertEqual(["psr-maths"], [s["id"] for s in by_id["psr"]["subjects"]])
        self.assertEqual({"ada-francais", "ada-maths"}, {s["id"] for s in by_id["ada"]["subjects"]})

    def test_user_token_is_not_stored_plaintext_and_authenticates(self):
        user, token = self.store.create_user("Fadhila", "teacher")
        self.assertEqual(user["display_name"], "Fadhila")
        with self.store.connect() as db:
            row = db.execute("SELECT token_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        self.assertNotEqual(token, row["token_hash"])
        self.assertEqual(server.hash_token(token), row["token_hash"])
        self.assertEqual(user["id"], self.store.authenticate_token(token)["id"])

    def test_rotate_token_invalidates_old_token_and_browser_sessions(self):
        user, token = self.store.create_user("Waren", "teacher")
        raw_session, _ = self.store.create_browser_session(user["id"])
        self.assertIsNotNone(self.store.user_from_browser_session(raw_session))
        replacement = self.store.rotate_user_token(user["id"])
        self.assertIsNone(self.store.authenticate_token(token))
        self.assertIsNotNone(self.store.authenticate_token(replacement))
        self.assertIsNone(self.store.user_from_browser_session(raw_session))

    def test_deactivation_is_reversible(self):
        user, token = self.store.create_user("Laura", "teacher")
        self.store.set_user_active(user["id"], False)
        self.assertIsNone(self.store.authenticate_token(token))
        self.store.set_user_active(user["id"], True)
        self.assertIsNotNone(self.store.authenticate_token(token))

    def test_teacher_sessions_are_owned_and_reconstruct_join_url(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        other, _ = self.store.create_user("Fadhila", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"],
            formation_id="ada",
            subject_id="ada-francais",
            session_number=1,
            title="Prénom et sons",
            group_label="ADA 1",
        )
        own = self.store.list_class_sessions(teacher["id"])
        foreign = self.store.list_class_sessions(other["id"])
        self.assertEqual(created["id"], own[0]["id"])
        self.assertEqual([], foreign)
        token = created["join_url"].split("?join=", 1)[1]
        self.assertEqual(created["id"], server.verify_join_token(token))

    def test_invalid_join_signature_is_rejected(self):
        self.assertIsNone(server.verify_join_token("session.invalid"))

    def test_corrections_default_locked_and_are_teacher_scoped(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        other, _ = self.store.create_user("Waren", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="", group_label="ADA"
        )
        self.assertFalse(created["corrections_unlocked"])
        unlocked = self.store.set_corrections(created["id"], teacher["id"], True)
        self.assertTrue(unlocked["corrections_unlocked"])
        with self.assertRaises(ValueError):
            self.store.set_corrections(created["id"], other["id"], False)

    def test_learner_activity_is_scoped_and_summarised(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        other, _ = self.store.create_user("Fadhila", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="Prénom", group_label="ADA 1"
        )
        learner = self.store.register_learner(created["id"], first_name="Amina")
        resumed = self.store.register_learner(
            created["id"], first_name="ignored", learner_id=learner["id"]
        )
        self.assertEqual(learner["id"], resumed["id"])
        self.store.record_activity_event(
            created["id"], learner_id=learner["id"], event_type="answer",
            item_id="own-name", payload={"correct": False, "choice": "Mariam"},
        )
        self.store.record_activity_event(
            created["id"], learner_id=learner["id"], event_type="answer",
            item_id="own-name", payload={"correct": True, "choice": "Amina"},
        )
        self.store.record_activity_event(
            created["id"], learner_id=learner["id"], event_type="activity_completed",
            item_id="own-name", payload={},
        )
        activity = self.store.session_activity(created["id"], teacher["id"])
        summary = activity["learners"][0]
        self.assertEqual("Amina", summary["first_name"])
        self.assertEqual(2, summary["attempts"])
        self.assertEqual(1, summary["correct_answers"])
        self.assertEqual(1, summary["completed_items"])
        with self.assertRaises(ValueError):
            self.store.session_activity(created["id"], other["id"])

    def test_activity_event_cannot_cross_sessions(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        first = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="", group_label="ADA 1"
        )
        second = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=2, title="", group_label="ADA 1"
        )
        learner = self.store.register_learner(first["id"], first_name="Moussa")
        with self.assertRaises(ValueError):
            self.store.record_activity_event(
                second["id"], learner_id=learner["id"], event_type="answer",
                item_id="own-name", payload={"correct": True},
            )


if __name__ == "__main__":
    unittest.main()
