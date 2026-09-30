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


class LearningMixin:
    def register_learner(
        self,
        class_session_id: str,
        *,
        first_name: str,
        last_name: str = "",
        learner_id: str = "",
    ) -> dict:
        """Create a learner for a signed class session or resume the same browser learner."""
        session = self.get_class_session(class_session_id)
        if not session["active"]:
            raise ValueError("Cette séance est fermée.")

        if learner_id:
            learner = self.get_learner(learner_id, class_session_id=class_session_id)
            return learner

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
                FROM learners WHERE class_session_id=? ORDER BY created_at,id""",
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
                "joined_at": row["created_at"],
                "last_activity_at": None,
                "attempts": 0,
                "correct_answers": 0,
                "completed_items": 0,
            }
            for row in learner_rows
        }
        completed: dict[str, set[str]] = {row["id"]: set() for row in learner_rows}
        for row in event_rows:
            learner_id = row["learner_id"]
            summary = summaries.get(learner_id)
            if not summary:
                continue
            summary["last_activity_at"] = row["created_at"]
            if row["event_type"] == "answer":
                summary["attempts"] += 1
                try:
                    payload = json.loads(row["payload_json"] or "{}")
                except json.JSONDecodeError:
                    payload = {}
                if payload.get("correct") is True:
                    summary["correct_answers"] += 1
            elif row["event_type"] == "activity_completed":
                completed[learner_id].add(row["item_id"])
        for learner_id, items in completed.items():
            summaries[learner_id]["completed_items"] = len(items)
        return {"session": session, "learners": list(summaries.values())}
