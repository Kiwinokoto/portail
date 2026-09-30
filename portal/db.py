from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .core import DB_PATH


class BaseStore:
    def __init__(self, db_path: Path | str = DB_PATH):
        self.db_path = Path(db_path)

    @contextmanager
    def connect(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.db_path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=5000")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def init(self) -> None:
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin','teacher')),
                    token_hash TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS browser_sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sso_codes (
                    code_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    target TEXT NOT NULL,
                    challenge TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sso_codes_expiry
                    ON sso_codes(expires_at);
                CREATE TABLE IF NOT EXISTS formations (
                    id TEXT PRIMARY KEY, label TEXT NOT NULL, position INTEGER NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS subjects (
                    id TEXT PRIMARY KEY,
                    formation_id TEXT NOT NULL REFERENCES formations(id),
                    label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                    position INTEGER NOT NULL,
                    mode TEXT NOT NULL DEFAULT 'internal' CHECK(mode IN ('internal','external','planned')),
                    external_url TEXT, active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS teacher_subjects (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                    PRIMARY KEY(user_id, subject_id)
                );
                CREATE TABLE IF NOT EXISTS class_sessions (
                    id TEXT PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES users(id),
                    formation_id TEXT NOT NULL REFERENCES formations(id),
                    subject_id TEXT NOT NULL REFERENCES subjects(id),
                    session_number INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
                    group_label TEXT NOT NULL, corrections_unlocked INTEGER NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS learners (
                    id TEXT PRIMARY KEY,
                    class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
                    first_name TEXT NOT NULL, last_name TEXT NOT NULL, birth_date TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS activity_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
                    learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL, item_id TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
                );
                """
            )
            self._seed_catalog(db)

    def _seed_catalog(self, db: sqlite3.Connection) -> None:
        db.executemany(
            "INSERT OR IGNORE INTO formations(id,label,position) VALUES(?,?,?)",
            [("psr", "PSR", 10), ("ada", "ADA", 20)],
        )
        db.executemany(
            """INSERT OR IGNORE INTO subjects(
                id,formation_id,label,description,position,mode,external_url
            ) VALUES(?,?,?,?,?,?,?)""",
            [
                ("psr-maths", "psr", "Mathématiques",
                 "Diagnostic de rentrée et parcours mathématiques contextualisé PSR.",
                 10, "external", "https://maths.lagrandeclasse.fr/teacher"),
                ("ada-francais", "ada", "Français",
                 "Entrer dans l'écrit : littératie, sons, lettres, mots et lecture utile.",
                 10, "internal", None),
                ("ada-maths", "ada", "Mathématiques",
                 "Numératie fondamentale : quantités, nombres, calcul, monnaie, temps et mesures.",
                 20, "planned", None),
            ],
        )
        # Existing production databases predate the teacher-facing route.
        # The portal is a teacher workspace, so external subjects must never
        # send an authenticated teacher to the student landing page.
        db.execute(
            """UPDATE subjects
               SET external_url=?
               WHERE id='psr-maths'
                 AND external_url IN (?, ?, ?)""",
            (
                "https://maths.lagrandeclasse.fr/teacher",
                "https://maths.lagrandeclasse.fr",
                "https://maths.lagrandeclasse.fr/",
                "https://maths.lagrandeclasse.fr/teacher",
            ),
        )
