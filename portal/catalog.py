from __future__ import annotations


class CatalogMixin:
    def catalog_for(self, user: dict) -> list[dict]:
        with self.connect() as db:
            formations = db.execute(
                "SELECT id,label,position FROM formations WHERE active=1 ORDER BY position,label"
            ).fetchall()
            subjects = db.execute(
                """SELECT id,formation_id,label,description,position,mode,external_url
                FROM subjects WHERE active=1 ORDER BY position,label"""
            ).fetchall()
            explicit = db.execute(
                "SELECT subject_id FROM teacher_subjects WHERE user_id=?", (user["id"],)
            ).fetchall()
        allowed = {row["subject_id"] for row in explicit}
        restrict = bool(allowed) and user["role"] != "admin"
        by_formation: dict[str, list[dict]] = {}
        for row in subjects:
            if restrict and row["id"] not in allowed:
                continue
            by_formation.setdefault(row["formation_id"], []).append(dict(row))
        return [
            {"id": row["id"], "label": row["label"], "subjects": by_formation.get(row["id"], [])}
            for row in formations if by_formation.get(row["id"], [])
        ]

    def subject_exists(self, formation_id: str, subject_id: str) -> bool:
        with self.connect() as db:
            row = db.execute(
                "SELECT 1 FROM subjects WHERE id=? AND formation_id=? AND active=1",
                (subject_id, formation_id),
            ).fetchone()
        return bool(row)
