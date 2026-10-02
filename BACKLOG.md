# Portail LGC — backlog / handoff

## Product decision — 2 October 2026

**Portail is now the canonical repository and site for the formations and courses currently being developed and tested.** The goal is immediate usability with colleagues on one subdomain, one authentication model, one formation → subject → pathway navigation and one set of teacher tools before any later Moodle integration.

`maths_lgc` was a useful emergency CAP PSR course site and its pedagogical content is worth preserving, but its separate teacher navigation/auth/session architecture is no longer a target. Keep it online for the existing cohort(s) and historical sessions; freeze feature work there except critical fixes. Migrate useful Maths content into Portail natively rather than wrapping or embedding the legacy teacher shell.

For new work:
- new PSR Maths sessions are to be created, joined, followed and reported from Portail;
- Portail owns the canonical class-session/roster/activity model;
- course content should be migrated into Portail primitives and cleaned up during migration rather than copied wholesale;
- the legacy Maths subdomain remains a compatibility surface until old cohorts no longer need it;
- do not generalise the old Portail → per-app SSO pattern to Playground, Roads or future courses unless a genuinely separate product requires it.

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
- [x] Register `Kiwinokoto/portail` in AgentCtl as project `portail` with the narrow scope `repo:Kiwinokoto/portail` (1 October 2026).
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
- [ ] Replace/extend hand-drawn V1 placeholders with a curated local image library rather than mass-generating assets. Prefer individually verified open-license sources, with a bulk candidate source only as an aid; keep source/author/license metadata and no runtime CDN dependency.
- [x] Add a scalable image-curation pipeline: source-agnostic concept manifest, Wikimedia/Openverse collection, resumable checkpoints, local downloads, heuristic candidate ranking/one-click suggestions, HTML gallery review, automatic renaming, provenance/licence manifest, audit and ZIP packaging. Seed contains 61 familiar concepts; Open Images cropping and stronger visual-quality ranking remain later extensions.
- [x] Start with very small sets: the V1 Memory uses four image↔word pairs, listening uses four short rounds, and learning cards are audio-first.
- [x] Define a content dataset independent from the game engine: `assets/learning/vocabulary.json` feeds cards, listening and Memory; illustrations live in one local SVG sprite.
- [x] Reuse the useful interaction ideas from `memory` selectively instead of embedding/copying the whole legacy app. The new implementation is Portail-native and preserves Portail identity/session boundaries and semantic feedback rules.
- [x] Add an explicit ADA French session pathway discriminator so a teacher can create either `positioning-v1` or `practice-v1`; existing ADA French/Maths sessions are backfilled to their historical pathways by an additive SQLite migration.
- [x] Route `practice-v1` signed learner sessions into the same prepared-roster identity flow and training menu while excluding them from positioning Reports and Corrigés.
- [ ] Generate the first curated production image batch from the seed manifest, review it in `gallery.html`, then replace selected V1 SVG placeholders only after the visual style is accepted.
- [ ] Grow the concept manifest progressively toward roughly 500–2,000 familiar concepts; keep concept IDs language-neutral so later translations do not duplicate image assets.
- [ ] Add an Open Images adapter for boxable concepts and optional automatic crops after the Wikimedia/Openverse workflow has been field-reviewed.
- [ ] Decide later, after classroom observation, whether practice history should remain coarse (started/audio only), record simple completion/repetition signals, or drive adaptive repetition. Do not feed raw practice attempts into positioning reports by default.
- [x] Compare Browser Web Speech, automatic Wiktionary/Commons audio and Sartus85 on real hardware. Decision 2 October 2026: prefer human Lingua Libre recordings for isolated vocabulary, with Sartus85 as the main voice; browser speech synthesis is only a fallback for unmatched dynamic text/phrases.
- [x] Remove the temporary admin audio lab after the decision and wire the current vocabulary/oral-word flows to the human-first audio resolver. Keep source/licence provenance under `assets/audio/README.md`.
- [ ] Replace remaining browser-TTS-only phrases/instructions with curated or generated high-quality audio where the wording must be spoken verbatim; do not silently rely on Web Speech availability.

## P2 — PSR Maths native migration

- [x] Decide architecture: Portail becomes the canonical repo/site for current courses; `maths_lgc` becomes legacy-only for existing cohorts (2 October 2026).
- [x] Promote PSR Mathematics from external subject to an internal Portail pathway without altering historical `maths_lgc` sessions. Legacy sessions remain surfaced separately as « Ancien Maths LGC ».
- [x] Migrate **Séance 1 / diagnostic de rentrée** first: the 10 audited legacy situations keep their original wording and response type, no learner-facing grade is shown, and « Je ne sais pas » is tracked as separate positioning evidence.
- [x] Migrate the PSR challenge: interactive recipe scaling (5–40 portions), coefficient, start-time calculation and simple revenue; track its three signals and completion natively in Portail.
- [ ] Migrate the eight post-diagnostic learning modules incrementally. **2/8 native:** Durées + Recettes & proportionnalité now include their concrete contexts, manipulation labs and four-item practice sets. Remaining: Pourcentages; Données & statistiques; Équations; Graphiques & fonctions; Prix & commerce; Probabilités.
- [x] Reuse Portail-native roster, QR/join link, live follow-up and reports for PSR Maths. Do not recreate a Maths-specific teacher dashboard.
- [x] Migrate a native guided-correction V1 for the 10 diagnostic situations and enable the existing Portail per-session correction lock. Learners can recheck the lock without reloading; their own responses are recalled locally on the same device, while teacher preview shows all strategies without learner writes.
- [ ] Restore the richer legacy correction visuals (notably fraction/percentage visualisations) where they materially improve understanding; the text strategy/explanations are already migrated.
- [x] Add a PSR Maths teacher preview that writes no learner activity.
- [x] Stop dropping teacher preview directly into diagnostic Q1: add a native PSR sequence overview, intro, five-step Séance 1 flow, persistent sequence navigation and visible eight-module continuation.
- [x] Promote the five shared teacher actions to focused top-level navigation once the teacher leaves the catalogue home; keep the home cards as the launcher and use sequence navigation as a separate secondary level.
- [x] Define PSR Maths Reports V1 separately from ADA numeracy: item/domain detail, explicit « Je ne sais pas » signals, diagnostic state and the three PSR challenge signals/completion, with no learner-facing global grade or ranking.
- [ ] Keep legacy `maths.lagrandeclasse.fr` online for the existing cohort and old session links; critical fixes only, no new product features.
- [ ] Once no active cohort depends on legacy Maths, archive its teacher surface and decide whether any historical data export/import is needed before shutdown.
- [x] Preserve the legacy SSO/deep-link path during transition so existing sessions remain reachable from Portail while migration is incomplete.
- [x] Validate legacy cross-device ownership mechanism (1 October 2026); treat it as compatibility, not future architecture.

## Field validation still pending

- [x] Portail → Maths ownership recovery across devices: manually validated 1 October 2026 (session created on phone, recovered on desktop under the same Portail account).
- [x] Validate legacy Portail → Maths deep-link routing for already-owned sessions: `tab=live&session=...` lands on the intended old follow-up.
- [ ] Field-check the compatibility repair that adopts **pre-SSO unowned sessions** only when the legacy teacher name matches the Portail identity unambiguously; this should make Kevin's older Tuesday session appear directly in Portail without changing its historical id/data.
- [x] Reproduce the current browser-TTS failure on Brave/Linux VM (2 October 2026): Web Speech API is exposed but `speechSynthesis.getVoices()` stays empty after waiting, so the existing buttons fail silently. Treat API presence alone as insufficient capability detection.
- [ ] Validate native PSR Maths `rentree-v1` on a disposable Portail session: focused teacher nav → create/preload roster → learner QR → sequence overview → 10 diagnostic situations → « Je ne sais pas » → correction lock → PSR challenge → live view → report; confirm legacy Maths sessions remain separately labelled and usable.
- [ ] Validate the first migrated continuation modules on learner device: **Durées** slider + 4 situations, then **Recettes** portion slider + 4 situations; live view should read « Diagnostic x/10 · Défi x/3 · n module(s) » instead of a misleading global step fraction.
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

## Current handoff — 2 October 2026

Production is live on `portail.lagrandeclasse.fr` and `maths.lagrandeclasse.fr`.

Teacher navigation remains organised around five shared workspaces: **Séances → Parcours → Corrigés → Suivi en direct → Rapports**. The architectural decision has changed: these workspaces should now be implemented natively in Portail for PSR Maths rather than mirrored across a second teacher shell.

The Portail→Maths SSO remains in production only as a transition/legacy bridge. Existing Maths cohorts and old links must keep working, but all new PSR Maths product work moves into Portail. Useful pedagogical content from `maths_lgc` will be migrated and cleaned up; its separate teacher auth/navigation/session stack will not be reproduced.

Native PSR Maths migration now includes a sequence overview, the concrete PSR intro, the 10 audited diagnostic situations, guided corrections, the interactive **Préparer le service** challenge and a descriptive report covering both diagnostic and challenge. Teacher preview no longer lands on question 1. The eight later modules are visible in the native sequence; **Durées** and **Recettes & proportionnalité** are now fully migrated with interactive labs/practice, leaving six modules to port. Focused teacher pages now reuse **Séances → Parcours → Corrigés → Suivi en direct → Rapports** as a persistent top navigation instead of repeatedly showing the catalogue selectors.

AgentCtl registration for Portail is complete. Project id: `portail`; canonical repo: `Kiwinokoto/portail`; current allowed scope: `repo:Kiwinokoto/portail`. The routine CLI is available on the Mint workstation; the LGC VPS does not need it for ordinary GitHub Actions deployment.
