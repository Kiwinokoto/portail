from __future__ import annotations

import secrets

from .core import clean_text, iso, signed_join_url


class SessionsMixin:
    def create_class_session(
        self, *, teacher_id: int, formation_id: str, subject_id: str,
        session_number: int, title: str, group_label: str,
    ) -> dict:
        if not self.subject_exists(formation_id, subject_id):
            raise ValueError("Matière inconnue pour cette formation.")
        if not 1 <= int(session_number) <= 999:
            raise ValueError("Numéro de séance invalide.")
        title = clean_text(title, label="Titre", max_len=120, required=False)
        group_label = clean_text(group_label, label="Groupe", max_len=80)
        session_id = secrets.token_urlsafe(15)
        now = iso()
        with self.connect() as db:
            db.execute(
                """INSERT INTO class_sessions(
                    id,teacher_id,formation_id,subject_id,session_number,title,group_label,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?)""",
                (session_id, teacher_id, formation_id, subject_id, int(session_number), title, group_label, now, now),
            )
        return self.get_class_session(session_id, teacher_id=teacher_id)

    def list_class_sessions(self, teacher_id: int) -> list[dict]:
        with self.connect() as db:
            rows = db.execute(
                """SELECT s.*,f.label AS formation_label,sub.label AS subject_label
                FROM class_sessions s
                JOIN formations f ON f.id=s.formation_id
                JOIN subjects sub ON sub.id=s.subject_id
                WHERE s.teacher_id=? AND s.active=1 ORDER BY s.created_at DESC""",
                (teacher_id,),
            ).fetchall()
        return [self._public_class_session(dict(row)) for row in rows]

    def get_class_session(self, session_id: str, *, teacher_id: int | None = None) -> dict:
        params: list[object] = [session_id]
        where = "s.id=?"
        if teacher_id is not None:
            where += " AND s.teacher_id=?"
            params.append(teacher_id)
        with self.connect() as db:
            row = db.execute(
                f"""SELECT s.*,f.label AS formation_label,sub.label AS subject_label
                FROM class_sessions s
                JOIN formations f ON f.id=s.formation_id
                JOIN subjects sub ON sub.id=s.subject_id
                WHERE {where}""", tuple(params)
            ).fetchone()
        if not row:
            raise ValueError("Séance introuvable.")
        return self._public_class_session(dict(row))

    def set_corrections(self, session_id: str, teacher_id: int, unlocked: bool) -> dict:
        with self.connect() as db:
            cur = db.execute(
                "UPDATE class_sessions SET corrections_unlocked=?,updated_at=? WHERE id=? AND teacher_id=?",
                (1 if unlocked else 0, iso(), session_id, teacher_id),
            )
            if cur.rowcount != 1:
                raise ValueError("Séance introuvable.")
        return self.get_class_session(session_id, teacher_id=teacher_id)

    def _public_class_session(self, row: dict) -> dict:
        row["corrections_unlocked"] = bool(row.get("corrections_unlocked"))
        row["active"] = bool(row.get("active"))
        row["join_url"] = signed_join_url(row["id"])
        return row
