import os
import sqlite3
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
        psr_maths = by_id["psr"]["subjects"][0]
        self.assertEqual("external", psr_maths["mode"])
        self.assertEqual("https://maths.lagrandeclasse.fr/teacher", psr_maths["external_url"])
        self.assertEqual({"ada-francais", "ada-maths"}, {s["id"] for s in by_id["ada"]["subjects"]})
        ada_maths = next(s for s in by_id["ada"]["subjects"] if s["id"] == "ada-maths")
        self.assertEqual("internal", ada_maths["mode"])

    def test_init_repairs_legacy_psr_maths_student_url(self):
        with self.store.connect() as db:
            db.execute(
                "UPDATE subjects SET external_url=? WHERE id='psr-maths'",
                ("https://maths.lagrandeclasse.fr",),
            )
        self.store.init()
        admin, _ = self.store.create_user("Admin routing", "admin")
        catalog = self.store.catalog_for(admin)
        psr = next(item for item in catalog if item["id"] == "psr")
        maths = next(subject for subject in psr["subjects"] if subject["id"] == "psr-maths")
        self.assertEqual("https://maths.lagrandeclasse.fr/teacher", maths["external_url"])

    def test_init_promotes_legacy_ada_maths_plan_to_internal(self):
        with self.store.connect() as db:
            db.execute(
                "UPDATE subjects SET mode='planned',description='ancienne description' WHERE id='ada-maths'"
            )
        self.store.init()
        admin, _ = self.store.create_user("Admin numeracy", "admin")
        catalog = self.store.catalog_for(admin)
        ada = next(item for item in catalog if item["id"] == "ada")
        maths = next(subject for subject in ada["subjects"] if subject["id"] == "ada-maths")
        self.assertEqual("internal", maths["mode"])
        self.assertIn("Numératie fondamentale", maths["description"])

    def test_init_migrates_legacy_class_sessions_pathway_column(self):
        legacy_path = Path(self.tmp.name) / "legacy.sqlite3"
        with sqlite3.connect(legacy_path) as db:
            db.execute(
                """CREATE TABLE class_sessions (
                    id TEXT PRIMARY KEY,
                    teacher_id INTEGER NOT NULL,
                    formation_id TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    session_number INTEGER NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    group_label TEXT NOT NULL,
                    corrections_unlocked INTEGER NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"""
            )
        legacy_store = server.PortalStore(legacy_path)
        legacy_store.init()
        with legacy_store.connect() as db:
            columns = {row["name"] for row in db.execute("PRAGMA table_info(class_sessions)")}
        self.assertIn("pathway_id", columns)

    def test_sso_code_is_pkce_bound_and_single_use(self):
        import base64
        import hashlib

        user, _ = self.store.create_user("Kevin SSO", "teacher")
        verifier = "v" * 48
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode("utf-8")).digest()
        ).rstrip(b"=").decode("ascii")
        code = self.store.create_sso_code(user["id"], target="maths", challenge=challenge)

        self.assertIsNone(
            self.store.redeem_sso_code(code, target="maths", verifier="wrong-verifier")
        )
        redeemed = self.store.redeem_sso_code(code, target="maths", verifier=verifier)
        self.assertEqual(user["id"], redeemed["id"])
        self.assertEqual("Kevin SSO", redeemed["display_name"])
        self.assertIsNone(
            self.store.redeem_sso_code(code, target="maths", verifier=verifier)
        )

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
        self.assertEqual("positioning-v1", created["pathway_id"])
        self.assertEqual("positioning-v1", own[0]["pathway_id"])
        self.assertEqual([], foreign)
        token = created["join_url"].split("?join=", 1)[1]
        self.assertEqual(created["id"], server.verify_join_token(token))

    def test_ada_french_practice_pathway_is_explicit_and_preserved(self):
        teacher, _ = self.store.create_user("Kevin practice", "teacher")
        practice = self.store.create_class_session(
            teacher_id=teacher["id"],
            formation_id="ada",
            subject_id="ada-francais",
            pathway_id="practice-v1",
            session_number=2,
            title="Cartes et Memory",
            group_label="ADA pratique",
        )
        self.assertEqual("practice-v1", practice["pathway_id"])

        with self.store.connect() as db:
            db.execute("UPDATE class_sessions SET pathway_id='default' WHERE id=?", (practice["id"],))
        self.store.init()
        migrated = self.store.get_class_session(practice["id"], teacher_id=teacher["id"])
        self.assertEqual("positioning-v1", migrated["pathway_id"])

        with self.assertRaisesRegex(ValueError, "Parcours inconnu"):
            self.store.create_class_session(
                teacher_id=teacher["id"],
                formation_id="ada",
                subject_id="ada-francais",
                pathway_id="unknown-v1",
                session_number=3,
                title="",
                group_label="ADA pratique",
            )

    def test_session_close_reopen_is_reversible_and_relocks_corrections(self):
        teacher, _ = self.store.create_user("Kevin lifecycle", "teacher")
        other, _ = self.store.create_user("Waren lifecycle", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"],
            formation_id="ada",
            subject_id="ada-francais",
            session_number=9,
            title="Cycle de vie",
            group_label="ADA test",
        )
        self.store.set_corrections(created["id"], teacher["id"], True)
        closed = self.store.set_session_active(created["id"], teacher["id"], False)
        self.assertFalse(closed["active"])
        self.assertFalse(closed["corrections_unlocked"])
        self.assertEqual([], self.store.list_class_sessions(teacher["id"]))
        archived = self.store.list_class_sessions(teacher["id"], include_inactive=True)
        self.assertEqual(created["id"], archived[0]["id"])
        self.assertFalse(archived[0]["active"])
        with self.assertRaises(ValueError):
            self.store.set_corrections(created["id"], teacher["id"], True)
        with self.assertRaises(ValueError):
            self.store.set_session_active(created["id"], other["id"], True)
        reopened = self.store.set_session_active(created["id"], teacher["id"], True)
        self.assertTrue(reopened["active"])
        self.assertFalse(reopened["corrections_unlocked"])

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
        self.assertTrue(summary["started"])
        self.assertEqual(1, activity["started_count"])
        self.assertEqual("Amina", summary["first_name"])
        self.assertEqual(2, summary["attempts"])
        self.assertEqual(1, summary["correct_answers"])
        self.assertEqual(1, summary["completed_items"])
        self.assertEqual(2, summary["items"]["own-name"]["attempts"])
        self.assertEqual(1, summary["items"]["own-name"]["correct_answers"])
        self.assertTrue(summary["items"]["own-name"]["completed"])
        own_name = next(item for item in activity["items"] if item["item_id"] == "own-name")
        self.assertEqual(1, own_name["completed_count"])
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

    def test_teacher_preloads_roster_and_public_view_minimises_names(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        other, _ = self.store.create_user("Waren", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="", group_label="ADA 1"
        )
        result = self.store.add_roster_learners(
            created["id"],
            teacher["id"],
            [
                {"first_name": "Amina", "last_name": "Diallo"},
                {"first_name": "Moussa", "last_name": "Traoré"},
                {"first_name": "amina", "last_name": "diallo"},
            ],
        )
        self.assertEqual(2, result["created"])
        self.assertEqual(1, result["skipped"])
        self.assertEqual(["Amina", "Moussa"], [row["first_name"] for row in result["learners"]])
        public = self.store.public_roster(created["id"])
        self.assertEqual(
            {"id", "first_name", "last_initial"},
            set(public[0]),
        )
        self.assertEqual("D.", public[0]["last_initial"])
        self.assertNotIn("last_name", public[0])
        activity = self.store.session_activity(created["id"], teacher["id"])
        self.assertEqual(0, activity["started_count"])
        self.assertTrue(all(not learner["started"] for learner in activity["learners"]))
        with self.assertRaises(ValueError):
            self.store.list_roster(created["id"], other["id"])

    def test_roster_corrections_are_safe_and_teacher_scoped(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        other, _ = self.store.create_user("Waren", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="", group_label="ADA 1"
        )
        learners = self.store.add_roster_learners(
            created["id"], teacher["id"],
            [
                {"first_name": "Amina", "last_name": "Dallo"},
                {"first_name": "Moussa", "last_name": "Traoré"},
            ],
        )["learners"]
        amina = learners[0]
        moussa = learners[1]

        fixed = self.store.update_roster_learner(
            created["id"], teacher["id"], amina["id"],
            first_name="Amina", last_name="Diallo",
        )
        self.assertEqual("Diallo", fixed["last_name"])
        with self.assertRaises(ValueError):
            self.store.update_roster_learner(
                created["id"], other["id"], amina["id"],
                first_name="Amina", last_name="Diallo",
            )

        removed = self.store.remove_roster_learner(created["id"], teacher["id"], moussa["id"])
        self.assertTrue(removed["ok"])
        self.assertEqual(1, len(self.store.list_roster(created["id"], teacher["id"])))

        self.store.record_activity_event(
            created["id"], learner_id=amina["id"], event_type="activity_started",
            item_id="positioning-v1", payload={},
        )
        with self.assertRaisesRegex(ValueError, "activité enregistrée"):
            self.store.remove_roster_learner(created["id"], teacher["id"], amina["id"])

    def test_preloaded_learner_becomes_started_after_selection_event(self):
        teacher, _ = self.store.create_user("Kevin", "teacher")
        created = self.store.create_class_session(
            teacher_id=teacher["id"], formation_id="ada", subject_id="ada-francais",
            session_number=1, title="", group_label="ADA 1"
        )
        roster = self.store.add_roster_learners(
            created["id"],
            teacher["id"],
            [{"first_name": "Amina", "last_name": "Diallo"}],
        )["learners"]
        selected = self.store.register_learner(
            created["id"],
            first_name="",
            learner_id=roster[0]["id"],
        )
        self.store.record_activity_event(
            created["id"],
            learner_id=selected["id"],
            event_type="activity_started",
            item_id="positioning-v1",
            payload={"entry": "roster"},
        )
        activity = self.store.session_activity(created["id"], teacher["id"])
        self.assertEqual(1, activity["started_count"])
        self.assertTrue(activity["learners"][0]["started"])
        self.assertIsNotNone(activity["learners"][0]["started_at"])


if __name__ == "__main__":
    unittest.main()
