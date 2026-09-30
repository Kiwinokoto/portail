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
- [x] Merge ADA French positioning V1 into `main` (PR #2, `45951f9`).
- [ ] Register `Kiwinokoto/portail` in AgentCtl when the admin broker is available, before shared/automated mutation becomes possible.
- [ ] Configure deployment secrets and deploy `portail.lagrandeclasse.fr` through the LGC Traefik network.

## P1 — first real teaching vertical

- [x] ADA → French positioning V1: signed learner join, own-name recognition and first-letter recognition.
- [x] Audio-first instructions with browser speech synthesis and visible-text fallback.
- [x] Persist lightweight learner activity events and expose a teacher-owned session summary.
- [x] Teacher live view using 4 s polling.
- [x] Remove first-entry typing: teacher-preloaded roster + learner selection with spoken-name support.
- [x] Minimise public roster identity to first name + optional last-name initial.
- [ ] Add safe roster edit/remove for corrections; current UI only appends and ignores exact duplicates.
- [ ] Decide whether multi-device selection of the same prepared learner needs a claim/device safeguard after classroom testing.
- [x] Add first oral-comprehension probe without reading: spoken everyday nouns → pictorial choices.
- [x] Sequence positioning oral-first: identity → oral → own name → first letter → finish.
- [ ] Extend positioning further: visual discrimination, sound/letter matching, useful-word reading and writing gestures.
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

All tested functional work through PR #6 is merged into `main` at `5ec54d2`.

Deployment preparation is now isolated on `dev/deploy-vps-v1`. It adds a GitHub Actions → VPS rsync deployment flow matching the proven `maths_lgc` pattern, targeting `/opt/portail` and the existing `traefik_network`. This avoids storing GitHub credentials on the VPS.

Before merging the deployment PR, configure repository Actions secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` and `PORTAIL_APP_SECRET`, and ensure DNS `portail.lagrandeclasse.fr` points to `173.212.214.227`. The first admin is then created manually inside the running container so its one-time token never appears in CI logs.

The owner explicitly confirmed there is no local clone, no unpushed work and no remaining previous-agent activity, and explicitly authorised this deployment work despite AgentCtl/RDC being unavailable today. AgentCtl registration remains pending and must still be completed when RDC/admin broker access returns.

`maths_lgc` remains untouched.
