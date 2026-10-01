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

- [x] Add reversible session lifecycle: close disables learner access immediately and relocks corrections; reports/history remain available; teacher can reopen later.
- [x] ADA → French positioning V1: signed learner join, own-name recognition and first-letter recognition.
- [x] Audio-first instructions with browser speech synthesis and visible-text fallback.
- [x] Persist lightweight learner activity events and expose a teacher-owned session summary.
- [x] Teacher live view using visibility-aware 4 s polling.
- [x] Remove first-entry typing: teacher-preloaded roster + learner selection with spoken-name support.
- [x] Minimise public roster identity to first name + optional last-name initial.
- [x] Add safe roster edit/remove for corrections; names can be fixed at any time, and removal is refused once activity exists so learner work is not destroyed.
- [ ] Decide whether multi-device selection of the same prepared learner needs a claim/device safeguard after classroom testing.
- [x] Add first oral-comprehension probe without reading: spoken everyday nouns → pictorial choices.
- [x] Sequence positioning oral-first: identity → oral → own name → first letter → finish.
- [x] Compact teacher dashboard UI: side-by-side Formation/Matière selectors on desktop, visible selected states, clearer action affordances and compact empty sessions state.
- [x] Align Portail with the shared LGC semantic palette: violet/indigo identity, green success, orange retry/attention, red important/destructive; semantic colors are never decorative.
- [x] Extend positioning V2 with visual discrimination, a deliberately guided sound→letter association, recognition of one useful word and a non-scored writing gesture.
- [x] Separate letter-name recognition from decoding: the first-letter task remains letter-name recognition and the new sound→letter task is explicitly guided, not evidence of autonomous phoneme↔grapheme decoding.
- [ ] Add a genuinely independent phoneme↔grapheme probe only after pedagogical validation of the instruction and target items.
- [x] Teacher preview of ADA French runs the learner flow without a join token, learner persistence or activity recording.
- [x] Corrections remain locked by default per class session and now have a usable per-session teacher toggle.
- [x] Add focused per-item progress detail to ADA Reports V1 (oral comprehension, own-name recognition, first-letter task, completion) without turning the portal into a gradebook.

## P1b — foundational practice / learning cards

- [x] Review the existing private `La-Grande-Classe-R-D/memory` prototype as a reuse candidate. It already contains a small matching engine, TTS/audio fallback, responsive cards and offline/service-worker foundations, but its content/data layer is incomplete and it has no meaningful automated tests.
- [x] Add a distinct **practice preview** for fragile readers, separate from ADA positioning/assessment. Teacher preview now exposes learning cards, listening practice and a four-pair Memory with no learner writes. Practice retries are not diagnostic evidence and are not collapsed into a literacy score.
- [x] First reusable activity families in teacher preview: visual case matching (MAJ ↔ min), heard syllable ↔ written form, image ↔ useful word, listening ↔ useful written word, and small Memory-style matching games. An independent sound→letter exercise remains intentionally separate pending pedagogical validation.
- [x] Build a first shared **everyday vocabulary pool** for ADA rather than splitting basic words by vocational pathway. V1 contains eight local illustrated items; PSR/AEPE/context tags are metadata only.
- [ ] Keep the visual language adult and non-infantilising. Learning-card / Montessori-inspired image+word presentation is a reference pattern, not a claim that the module implements a full Montessori method.
- [x] Start with very small sets: the V1 Memory uses four image↔word pairs, listening uses four short rounds, and learning cards are audio-first.
- [x] Define a content dataset independent from the game engine: `assets/learning/vocabulary.json` feeds cards, listening and Memory; illustrations live in one local SVG sprite.
- [x] Reuse the useful interaction ideas from `memory` selectively instead of embedding/copying the whole legacy app. The new implementation is Portail-native and preserves Portail identity/session boundaries and semantic feedback rules.
- [ ] Decide later, after classroom observation, whether practice history should remain device-local, record simple completion/repetition signals, or drive adaptive repetition. Do not feed raw practice attempts into positioning reports by default.

## P2 — maths convergence

- [x] Define the shared five-workspace teacher model: Séances → Parcours → Corrigés → Suivi en direct → Rapports.
- [x] Harmonise the Portail and Maths LGC teacher UI on those five workspaces and expose explicit availability/status.
- [x] Attach new Maths sessions to the authenticated portal teacher identity so sessions survive browser/device changes without relying on locally stored management secrets. Legacy sessions keep their existing management-secret fallback.
- [x] Build Reports V1 in both teacher surfaces: group synthesis, learner detail, and descriptive cross-group comparison only for comparable sessions.
- [x] Add portal-issued one-time SSO handoff for Maths LGC using PKCE; no shared teacher token crosses subdomains.
- [x] Keep `maths_lgc` production untouched during the initial portal bootstrap; later Maths changes were deliberate convergence work after the portal foundation was live.
- [x] Model PSR Mathematics as an external teacher-facing subject; portal actions route to Maths LGC `/teacher`, never the student landing page.
- [x] Reuse the prepared-roster learner identity flow, teacher preview, live follow-up and report collection across ADA French and ADA Mathematics instead of creating a second session system.
- [x] Keep PSR Maths linked as an external interactive course through SSO rather than importing its content into Portail; ordinary-content migration remains a future Moodle decision.
- [x] Add ADA numeracy foundation V1 separately from CAP-level Maths LGC: concrete quantity, spoken numeral, quantity comparison, concrete addition and written money amount.

## Field validation still pending

- [ ] Revalidate Portail → Maths session recovery later on two distinct browsers/devices. Automated ownership tests are green and the behavior is provisionally accepted so work can continue, but Kevin deferred the phone/device recheck; do not describe it as directly field-validated yet.
- [ ] Validate ADA French V2 on actual learner phones/tablets: TTS, emoji/visual rendering, instruction comprehension and touch targets.
- [ ] Validate ADA Mathematics V1 on actual learner phones/tablets: quantities, € rendering, TTS and the wording « le plus » / « en tout ».
- [ ] Run one full teacher loop with real or disposable test learners: roster → QR → learner work → live view → corrections → Reports.
- [ ] Revisit the prepared-learner multi-device claim question only after observing classroom/device sharing behavior.

## Moodle migration principle

This project must stay easy to dismantle or adapt:
- teacher/student identity → Moodle;
- groups/enrolment → Moodle;
- programme-level progression → Roads;
- ordinary authored content → Moodle / Course Factory;
- high-value interactive exercises may remain as embedded/external activities.

## Current handoff — 30 September 2026

Production is live on `portail.lagrandeclasse.fr` and `maths.lagrandeclasse.fr`.

Teacher navigation is now harmonised around five shared workspaces: **Séances → Parcours → Corrigés → Suivi en direct → Rapports**. Portail exposes the same vocabulary for internal and external subjects; PSR Maths deep-links each action to the matching Maths workspace. Rapports V1 is active for Maths LGC, ADA French and ADA Mathematics.

The Portail→Maths SSO is in production. New Maths sessions created under SSO are bound to the stable Portail teacher identity and are designed to be listed/reopened after reconnecting on another browser or device. Automated tests cover the ownership boundary. For planning purposes the cross-device behavior is now **provisionally accepted**, while an explicit later two-browser/device revalidation remains on the checklist because Kevin deferred the phone retest. Legacy Maths sessions remain compatible with their existing per-session management secret.

Maths live follow-up polls every 4 seconds while visible. Reports V1 exists for Maths and ADA French. ADA teacher controls include safe roster correction/removal, per-session correction locking and per-item report detail. ADA French positioning V2 now extends the probe sequence through visual discrimination, guided sound→letter association, useful-word recognition and an unscored writing gesture, with an authenticated teacher preview that records no learner activity. Next validation should happen on real learner devices before adding stronger literacy inferences. ADA Mathematics now has its own narrow numeracy V1 and must likewise be field-tested before its probes are expanded.

AgentCtl registration remains pending while RDC/admin broker access is unavailable today. The owner confirmed there is no other active agent or unpushed local work.
