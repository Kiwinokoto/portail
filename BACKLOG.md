# Portail LGC — backlog / handoff

## Product decision — 30 September 2026

The portal is a temporary, lightweight pedagogical workspace while Moodle, Course Factory and Roads mature.
Primary navigation: **Formation → Subject → Subject pathway**.

Do not add a visible CAP/Bac Pro family level for now.

## P0 — foundations

- [x] Define product boundary and hierarchy.
- [x] Define admin / teacher authentication model.
- [x] Define SQLite schema for users, browser sessions, catalogue and class sessions.
- [x] Build first teacher shell: login, formations, subjects, create/reopen sessions.
- [x] Build minimal admin user management: create, rotate token, deactivate/reactivate.
- [x] Add signed student join URLs and QR generation endpoint.
- [x] Add tests for auth, catalogue, user lifecycle, session ownership and join signatures.
- [x] Bootstrap the new GitHub repository after the owner explicitly confirmed no concurrent agent work.
- [x] Merge the tested foundation branch into `main` (PR #1, `9c9ab71`).
- [ ] Register `Kiwinokoto/portail` in AgentCtl when the admin broker is available, before shared/automated mutation becomes possible.
- [ ] Configure deployment secrets and deploy `portail.lagrandeclasse.fr` through the LGC Traefik network.

## P1 — first real teaching vertical

- [x] ADA → French positioning V1: signed learner join, first-name identity, own-name recognition and first-letter recognition.
- [x] Audio-first instructions with browser speech synthesis and visible-text fallback.
- [x] Persist lightweight learner activity events and expose a teacher-owned session summary.
- [x] Teacher live view using 4 s polling.
- [ ] Remove the remaining literacy assumption at first entry: let the teacher preload/select learner names so a learner never has to type their own name.
- [ ] Extend positioning beyond name recognition: oral comprehension, visual discrimination, sound/letter matching, useful-word reading and writing gestures.
- [ ] Separate letter-name recognition from true phoneme↔grapheme assessment; do not infer decoding ability from the current first-letter task.
- [ ] Teacher preview bypasses learner locks.
- [ ] Corrections remain locked by default per class session and need a usable teacher control.
- [ ] Add per-item progress detail only where it helps the teacher act; avoid turning the portal into a full LMS gradebook.

## P2 — maths convergence

- [ ] Keep `maths_lgc` production untouched during portal bootstrap.
- [ ] Model PSR Mathematics in the portal as a legacy/external subject initially.
- [ ] Extract/reuse generic session and teacher ideas without copying maths-specific hard-coded stages.
- [ ] Decide how/when existing maths content is imported or linked into the portal.
- [ ] Add ADA numeracy foundation separately from CAP-level maths diagnostics.

## Moodle migration principle

This project must stay easy to dismantle or adapt:
- teacher/student identity → Moodle;
- groups/enrolment → Moodle;
- programme-level progression → Roads;
- ordinary authored content → Moodle / Course Factory;
- high-value interactive exercises may remain as embedded/external activities.

## Current handoff — 30 September 2026

Foundation PR #1 is merged on `main` at `9c9ab71`.

The ADA French V1 continuation is intentionally isolated from the untouched `dev/ada-francais-v1` branch because the previous chat could not be proven fully stopped without AgentCtl/RDC. The owner explicitly authorised resuming after GitHub showed no new activity; no local/unpushed work from the previous chat can be verified from here.

Current ADA V1 implementation adds:
- learner registration/resume scoped to a signed class-session link;
- first-name recognition and first-letter recognition with French browser TTS;
- activity events stored in the existing `learners` / `activity_events` tables;
- teacher live summaries polled every 4 seconds;
- cross-session ownership checks and HTTP/store tests.

Known limitation: first-time learner entry still needs the name to be typed once (teacher assistance is explicitly allowed). This is scaffolding, not the final low-literacy UX. See `docs/ada-francais-v1.md`.

AgentCtl registration is still pending because RDC/admin broker access is unavailable in this pass. Do not describe the repository as registered until that has actually been done. No deployment was attempted.
