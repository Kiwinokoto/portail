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
- [x] Configure deployment secrets and deploy `portail.lagrandeclasse.fr` through the LGC Traefik network (PR #7, workflow run #1 successful).

## P1 — first real teaching vertical

- [x] ADA → French positioning V1: signed learner join, own-name recognition and first-letter recognition.
- [x] Audio-first instructions with browser speech synthesis and visible-text fallback.
- [x] Persist lightweight learner activity events and expose a teacher-owned session summary.
- [x] Teacher live view using 4 s polling.
- [x] Remove first-entry typing: teacher-preloaded roster + learner selection with spoken-name support.
- [x] Minimise public roster identity to first name + optional last-name initial.
- [x] Add safe roster edit/remove for corrections; names can be fixed at any time, and removal is refused once activity exists so learner work is not destroyed.
- [ ] Decide whether multi-device selection of the same prepared learner needs a claim/device safeguard after classroom testing.
- [x] Add first oral-comprehension probe without reading: spoken everyday nouns → pictorial choices.
- [x] Sequence positioning oral-first: identity → oral → own name → first letter → finish.
- [x] Compact teacher dashboard UI: side-by-side Formation/Matière selectors on desktop, visible selected states, clearer action affordances and compact empty sessions state.
- [x] Align Portail with the shared LGC semantic palette: violet/indigo identity, green success, orange retry/attention, red important/destructive; semantic colors are never decorative.
- [ ] Extend positioning further: visual discrimination, sound/letter matching, useful-word reading and writing gestures.
- [ ] Separate letter-name recognition from true phoneme↔grapheme assessment; do not infer decoding ability from the current first-letter task.
- [ ] Teacher preview bypasses learner locks.
- [x] Corrections remain locked by default per class session and now have a usable per-session teacher toggle.
- [x] Add focused per-item progress detail to ADA Reports V1 (oral comprehension, own-name recognition, first-letter task, completion) without turning the portal into a gradebook.

## P2 — maths convergence

- [x] Define the shared five-workspace teacher model: Séances → Parcours → Corrigés → Suivi en direct → Rapports.
- [x] Harmonise the Portail and Maths LGC teacher UI on those five workspaces and expose explicit availability/status.
- [x] Attach new Maths sessions to the authenticated portal teacher identity so sessions survive browser/device changes without relying on locally stored management secrets. Legacy sessions keep their existing management-secret fallback.
- [x] Build Reports V1 in both teacher surfaces: group synthesis, learner detail, and descriptive cross-group comparison only for comparable sessions.
- [x] Add portal-issued one-time SSO handoff for Maths LGC using PKCE; no shared teacher token crosses subdomains.
- [ ] Keep `maths_lgc` production untouched during portal bootstrap.
- [x] Model PSR Mathematics as an external teacher-facing subject; portal actions route to Maths LGC `/teacher`, never the student landing page.
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

Production is live on `portail.lagrandeclasse.fr` and `maths.lagrandeclasse.fr`.

Teacher navigation is now harmonised around five shared workspaces: **Séances → Parcours → Corrigés → Suivi en direct → Rapports**. Portail exposes the same vocabulary for internal and external subjects; PSR Maths deep-links each action to the matching Maths workspace. Rapports is intentionally visible but still marked « à venir ».

The Portail→Maths SSO is in production. New Maths sessions created under SSO are bound to the stable Portail teacher identity and are designed to be listed/reopened after reconnecting on another browser or device. Automated tests cover the ownership boundary, but Kevin has not yet been able to perform the manual two-machine/two-browser validation, so this remains **implemented but not field-validated**. Legacy Maths sessions remain compatible with their existing per-session management secret.

Maths live follow-up polls every 4 seconds while visible. Reports V1 now exists for Maths and ADA French. ADA teacher controls now include safe roster correction/removal, per-session correction locking and per-item report detail. Next work should focus on teacher preview for ADA and extending the literacy positioning beyond the current oral/name/first-letter probes.

AgentCtl registration remains pending while RDC/admin broker access is unavailable today. The owner confirmed there is no other active agent or unpushed local work.
