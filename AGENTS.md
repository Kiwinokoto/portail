# AGENTS.md — portail

## Purpose
Temporary LGC pedagogical portal used while Moodle integration is still maturing.
It provides a lightweight teacher workspace for interactive courses, sessions and learner follow-up.

## Source of truth
- Canonical repository: `Kiwinokoto/portail`.
- Before any shared mutation, verify branch/remotes/recent commits/local divergence and acquire the AgentCtl lease `repo:Kiwinokoto/portail`.
- Use `main` as stable baseline and `dev/<topic>` for non-trivial work.
- Never force-push or rewrite shared history.
- Keep this file and `BACKLOG.md` aligned with the real Git state.

## Product structure
Navigation is deliberately: **Formation → Subject → Subject pathway**.
Do not add a CAP/Bac Pro family layer to the main navigation unless a real UX need appears.

Initial formations:
- PSR
- ADA

Initial subjects:
- PSR → Mathematics (legacy course currently lives at `maths.lagrandeclasse.fr`)
- ADA → French / literacy
- ADA → Mathematics / numeracy (planned)

## Product boundaries
The portal owns, temporarily:
- teacher authentication and a tiny admin user manager;
- formation/subject catalogue;
- teacher sessions, student join links/QR codes;
- teacher preview mode, correction-release state and lightweight learner activity follow-up;
- interactive learning content that provides value beyond ordinary Moodle pages.

The portal does **not** aim to recreate Moodle. Do not add timetables, messaging, institution-wide enrolment, SCORM management or general LMS administration.
Long term, identities/groups move to Moodle, pathway orchestration to Roads, ordinary course content to Moodle/Factory, while genuinely interactive activities may remain web modules.

## Security
- Never store plaintext teacher tokens in SQLite; store SHA-256 only because tokens are high-entropy generated secrets, not passwords.
- Browser authentication uses opaque server-side sessions and HttpOnly cookies.
- Student access uses signed session links, not student accounts in V1.
- Never commit `.env`, SQLite data, tokens, deployment credentials or learner data.
- New teachers are created by an administrator and receive a generated token shown once.
- Deactivation must be reversible; do not delete users as the normal offboarding path.

## Architecture
- Python 3.13 standard-library HTTP server + SQLite, intentionally dependency-light.
- Static HTML/CSS/JS frontend.
- `qrcode` is the only runtime package in the first foundation pass.
- Persistent state lives under `PORTAIL_DATA_DIR`.
- Keep catalogue/domain concepts explicit so later Moodle/Roads adapters can replace local ownership cleanly.

## Tests
Run targeted tests, then:

```bash
python -m unittest discover -s tests -v
python -m compileall -q server.py tests
```

Before deployment, also smoke-test `/healthz`, teacher login, admin user creation, session creation and signed learner links.

## Handoff
Before ending a development pass: re-check lease, branch, HEAD, worktree status and remote divergence; push the working branch if possible; record blockers and next steps in `BACKLOG.md`; release the lease.
