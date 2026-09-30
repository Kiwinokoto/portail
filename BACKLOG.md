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
- [ ] Register `Kiwinokoto/portail` in AgentCtl when the admin broker is available, before shared/automated mutation becomes possible.
- [ ] Merge the tested foundation branch into `main`.
- [ ] Configure deployment secrets and deploy `portail.lagrandeclasse.fr` through the LGC Traefik network.

## P1 — first real teaching vertical

- [ ] ADA → French: initial learner positioning without assuming literacy.
- [ ] First activity: recognise own first name and connect spoken form ↔ written word.
- [ ] Introduce alphabetic principle through meaningful words/sounds, not rote A→Z first.
- [ ] Audio-first instructions and adult-appropriate visuals.
- [ ] Teacher live view using simple polling first (3–5 s); consider SSE only if needed.
- [ ] Teacher preview bypasses learner locks.
- [ ] Corrections remain locked by default per class session.

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

## Current handoff

The foundation is tested locally. The GitHub bootstrap was explicitly authorised by the repository owner after confirming there was no other active ChatGPT agent. AgentCtl registration is still pending because the restricted admin broker is not currently reachable from this chat; do not describe the repository as registered until that has actually been done.
