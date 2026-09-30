from __future__ import annotations

import json
import secrets

from .core import clean_text, iso

_ALLOWED_EVENT_TYPES = {
    "activity_started",
    "audio_played",
    "answer",
    "activity_completed",
}
_MAX_ROSTER_BATCH = 100


class LearningMixin:
    def register_learner(
        self,
        class_session_id: str,
        *,
        first_name: str,
        last_name: str = "",
        learner_id: str = "",
    ) -> dict:
        """Create a learner for a signed class session or resume/select an existing learner."""
        session = self.get_class_session(class_session_id)
        if not session["active"]:
            raise ValueError("Cette séance est fermée.")

        if learner_id:
            return self.get_learner(learner_id, class_session_id=class_session_id)

        first_name = clean_text(first_name, label="Prénom", max_len=60)
        last_name = clean_text(last_name, label="Nom", max_len=80, required=False)
        learner_id = secrets.token_urlsafe(12)
        now = iso()
        with self.connect() as db:
            db.execute(
                """INSERT INTO learners(
                    id,class_session_id,first_name,last_name,created_at,updated_at
                ) VALUES(?,?,?,?,?,?)""",
                (learner_id, class_session_id, first_name, last_name, now, now),
            )
        return self.get_learner(learner_id, class_session_id=class_session_id)

    def get_learner(self, learner_id: str, *, class_session_id: str | None = None) -> dict:
        params: list[object] = [learner_id]
        where = "id=?"
        if class_session_id is not None:
            where += " AND class_session_id=?"
            params.append(class_session_id)
        with self.connect() as db:
            row = db.execute(
                f"""SELECT id,class_session_id,first_name,last_name,created_at,updated_at
                FROM learners WHERE {where}""",
                tuple(params),
            ).fetchone()
        if not row:
            raise ValueError("Élève introuvable pour cette séance.")
        return dict(row)

    def list_roster(self, class_session_id: str, teacher_id: int) -> list[dict]:
        self.get_class_session(class_session_id, teacher_id=teacher_id)
        with self.connect() as db:
            rows = db.execute(
                """SELECT id,first_name,last_name
                FROM learners WHERE class_session_id=?
                ORDER BY first_name COLLATE NOCASE,last_name COLLATE NOCASE,id""",
                (class_session_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def public_roster(self, class_session_id: str) -> list[dict]:
        session = self.get_class_session(class_session_id)
        if not session["active"]:
            raise ValueError("Cette séance est fermée.")
        with self.connect() as db:
            rows = db.execute(
                """SELECT id,first_name,last_name
                FROM learners WHERE class_session_id=?
                ORDER BY first_name COLLATE NOCASE,last_name COLLATE NOCASE,id""",
                (class_session_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "first_name": row["first_name"],
                "last_initial": f"{row['last_name'][0].upper()}." if row["last_name"] else "",
            }
            for row in rows
        ]

    def add_roster_learners(
        self,
        class_session_id: str,
        teacher_id: int,
        learners: list[dict],
    ) -> dict:
        self.get_class_session(class_session_id, teacher_id=teacher_id)
        if not isinstance(learners, list) or not learners:
            raise ValueError("Ajoute au moins un élève.")
        if len(learners) > _MAX_ROSTER_BATCH:
            raise ValueError(f"Maximum {_MAX_ROSTER_BATCH} élèves par ajout.")

        cleaned: list[tuple[str, str]] = []
        seen_in_request: set[tuple[str, str]] = set()
        for item in learners:
            if not isinstance(item, dict):
                raise ValueError("Liste d'élèves invalide.")
            first_name = clean_text(item.get("first_name"), label="Prénom", max_len=60)
            last_name = clean_text(item.get("last_name"), label="Nom", max_len=80, required=False)
            key = (first_name.casefold(), last_name.casefold())
            if key in seen_in_request:
                continue
            seen_in_request.add(key)
            cleaned.append((first_name, last_name))

        with self.connect() as db:
            existing_rows = db.execute(
                "SELECT first_name,last_name FROM learners WHERE class_session_id=?",
                (class_session_id,),
            ).fetchall()
            existing = {
                (row["first_name"].casefold(), row["last_name"].casefold())
                for row in existing_rows
            }
            now = iso()
            created = 0
            skipped = 0
            for first_name, last_name in cleaned:
                key = (first_name.casefold(), last_name.casefold())
                if key in existing:
                    skipped += 1
                    continue
                db.execute(
                    """INSERT INTO learners(
                        id,class_session_id,first_name,last_name,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?)""",
                    (secrets.token_urlsafe(12), class_session_id, first_name, last_name, now, now),
                )
                existing.add(key)
                created += 1
        return {
            "learners": self.list_roster(class_session_id, teacher_id),
            "created": created,
            "skipped": skipped + (len(learners) - len(cleaned)),
        }

    def update_roster_learner(
        self,
        class_session_id: str,
        teacher_id: int,
        learner_id: str,
        *,
        first_name: str,
        last_name: str = "",
    ) -> dict:
        self.get_class_session(class_session_id, teacher_id=teacher_id)
        learner = self.get_learner(learner_id, class_session_id=class_session_id)
        first_name = clean_text(first_name, label="Prénom", max_len=60)
        last_name = clean_text(last_name, label="Nom", max_len=80, required=False)
        with self.connect() as db:
            duplicate = db.execute(
                """SELECT id FROM learners
                WHERE class_session_id=? AND id<>?
                AND lower(first_name)=lower(?) AND lower(last_name)=lower(?)""",
                (class_session_id, learner_id, first_name, last_name),
            ).fetchone()
            if duplicate:
                raise ValueError("Un élève avec ce prénom et ce nom existe déjà dans la séance.")
            now = iso()
            db.execute(
                "UPDATE learners SET first_name=?,last_name=?,updated_at=? WHERE id=?",
                (first_name, last_name, now, learner["id"]),
            )
        return self.get_learner(learner_id, class_session_id=class_session_id)

    def remove_roster_learner(
        self,
        class_session_id: str,
        teacher_id: int,
        learner_id: str,
    ) -> dict:
        self.get_class_session(class_session_id, teacher_id=teacher_id)
        learner = self.get_learner(learner_id, class_session_id=class_session_id)
        with self.connect() as db:
            activity_count = db.execute(
                "SELECT COUNT(*) AS n FROM activity_events WHERE learner_id=? AND class_session_id=?",
                (learner_id, class_session_id),
            ).fetchone()["n"]
            if activity_count:
                raise ValueError(
                    "Cet élève a déjà une activité enregistrée. Corrige son nom plutôt que de le retirer."
                )
            db.execute(
                "DELETE FROM learners WHERE id=? AND class_session_id=?",
                (learner_id, class_session_id),
            )
        return {"ok": True, "learner_id": learner_id}

    def record_activity_event(
        self,
        class_session_id: str,
        *,
        learner_id: str,
        event_type: str,
        item_id: str = "",
        payload: dict | None = None,
    ) -> dict:
        session = self.get_class_session(class_session_id)
        if not session["active"]:
            raise ValueError("Cette séance est fermée.")
        self.get_learner(learner_id, class_session_id=class_session_id)
        event_type = clean_text(event_type, label="Événement", max_len=48)
        if event_type not in _ALLOWED_EVENT_TYPES:
            raise ValueError("Type d'événement invalide.")
        item_id = clean_text(item_id, label="Activité", max_len=80, required=False)
        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            raise ValueError("Données d'activité invalides.")
        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(payload_json.encode("utf-8")) > 4096:
            raise ValueError("Données d'activité trop volumineuses.")
        now = iso()
        with self.connect() as db:
            db.execute(
                """INSERT INTO activity_events(
                    class_session_id,learner_id,event_type,item_id,payload_json,created_at
                ) VALUES(?,?,?,?,?,?)""",
                (class_session_id, learner_id, event_type, item_id, payload_json, now),
            )
            db.execute("UPDATE learners SET updated_at=? WHERE id=?", (now, learner_id))
        return {"ok": True, "created_at": now}

    def session_activity(self, class_session_id: str, teacher_id: int) -> dict:
        session = self.get_class_session(class_session_id, teacher_id=teacher_id)
        with self.connect() as db:
            learner_rows = db.execute(
                """SELECT id,first_name,last_name,created_at,updated_at
                FROM learners WHERE class_session_id=?
                ORDER BY first_name COLLATE NOCASE,last_name COLLATE NOCASE,id""",
                (class_session_id,),
            ).fetchall()
            event_rows = db.execute(
                """SELECT learner_id,event_type,item_id,payload_json,created_at
                FROM activity_events WHERE class_session_id=? ORDER BY id""",
                (class_session_id,),
            ).fetchall()

        summaries = {
            row["id"]: {
                "id": row["id"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "listed_at": row["created_at"],
                "started": False,
                "started_at": None,
                "last_activity_at": None,
                "attempts": 0,
                "correct_answers": 0,
                "completed_items": 0,
                "items": {},
            }
            for row in learner_rows
        }
        completed: dict[str, set[str]] = {row["id"]: set() for row in learner_rows}
        item_order: list[str] = []

        for row in event_rows:
            learner_id = row["learner_id"]
            summary = summaries.get(learner_id)
            if not summary:
                continue
            if not summary["started"]:
                summary["started"] = True
                summary["started_at"] = row["created_at"]
            summary["last_activity_at"] = row["created_at"]

            item_id = row["item_id"] or ""
            item = None
            if item_id:
                if item_id not in item_order:
                    item_order.append(item_id)
                item = summary["items"].setdefault(
                    item_id,
                    {"attempts": 0, "correct_answers": 0, "completed": False},
                )

            if row["event_type"] == "answer":
                summary["attempts"] += 1
                if item is not None:
                    item["attempts"] += 1
                try:
                    payload = json.loads(row["payload_json"] or "{}")
                except json.JSONDecodeError:
                    payload = {}
                if payload.get("correct") is True:
                    summary["correct_answers"] += 1
                    if item is not None:
                        item["correct_answers"] += 1
            elif row["event_type"] == "activity_completed" and item_id:
                completed[learner_id].add(item_id)
                if item is not None:
                    item["completed"] = True

        for learner_id, items in completed.items():
            summaries[learner_id]["completed_items"] = len(items)

        learners = list(summaries.values())
        item_summaries = []
        for item_id in item_order:
            attempts = 0
            correct_answers = 0
            completed_count = 0
            for learner in learners:
                item = learner["items"].get(item_id)
                if not item:
                    continue
                attempts += item["attempts"]
                correct_answers += item["correct_answers"]
                if item["completed"]:
                    completed_count += 1
            item_summaries.append(
                {
                    "item_id": item_id,
                    "attempts": attempts,
                    "correct_answers": correct_answers,
                    "completed_count": completed_count,
                }
            )

        return {
            "session": session,
            "learners": learners,
            "started_count": sum(1 for learner in learners if learner["started"]),
            "items": item_summaries,
        }
