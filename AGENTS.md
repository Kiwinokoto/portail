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
Teacher tooling uses one shared five-workspace vocabulary across internal and external subjects: **Séances → Parcours → Corrigés → Suivi en direct → Rapports**. Keep all five visible when useful; show explicit status for unfinished capabilities instead of inventing subject-specific labels for the same job.

Navigation is deliberately: **Formation → Subject → Subject pathway**.
Do not add a CAP/Bac Pro family layer to the main navigation unless a real UX need appears.

## ADA teacher/assessment invariants
- Teacher preview must never persist learner activity: ADA preview runs without a signed join token, learner localStorage identity or event writes.
- Literacy probes must preserve their narrow meaning: visual matching is not reading, guided sound→letter is not autonomous decoding, useful-word recognition is word-specific, and the writing canvas records only that a gesture was attempted.
- Do not aggregate the independent probes into a global literacy score unless a later pedagogical design explicitly justifies one.

## ADA numeracy invariants
- ADA numeracy is a foundation pathway, not the CAP PSR diagnostic copied downwards.
- Keep probes concrete and narrow: visible quantities, spoken-number recognition, more/less, one simple addition situation and recognition of a written money amount.
- Do not aggregate these probes into a global mathematics score. Report each signal separately and treat retries as teaching information, not grading.
- Prefer everyday/adult contexts and audio instructions; introduce formal mathematical vocabulary after the concrete situation.

## Visual language
- Identity/navigation: violet/indigo first, with blue and rose as neutral decorative accents.
- Semantic colors are reserved across the portal and learning activities: **green = correct/success/completed**, **orange = retry/needs work/attention**, **red = important/to remember/objective** (and destructive/system errors where appropriate).
- Do not use green or orange as decoration. A semantic state must never rely on color alone; pair it with text, iconography or explicit structure.
- Keep teacher surfaces mostly neutral + violet/indigo so learner-feedback colors keep their meaning.

Initial formations:
- PSR
- ADA

Initial subjects:
- PSR → Mathematics (legacy course currently lives at `maths.lagrandeclasse.fr`)
- ADA → French / literacy
- ADA → Mathematics / numeracy (internal V1)

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
- Cross-app teacher SSO uses a short-lived, one-time authorization code bound to a PKCE challenge. Never put the portal teacher token or the Maths legacy teacher token in a URL, browser-storage handoff, or cross-subdomain cookie.
- Maths LGC is the only allowed SSO target in V1; callback destination is fixed server-side, so there is no open redirect.
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

## Field-validation discipline
- Distinguish automated validation from field validation. Do not mark a browser/device/classroom behavior as validated merely because unit/smoke tests pass.
- Current explicit pending check: Maths SSO-owned session recovery across two distinct browsers/devices has automated coverage but has not yet been manually validated by Kevin.
- Do not deepen literacy or numeracy inference until the current learner flows have been observed on actual target devices.

## Handoff
Before ending a development pass: re-check lease, branch, HEAD, worktree status and remote divergence; push the working branch if possible; record blockers and next steps in `BACKLOG.md`; release the lease.
