# Architecture — Portail LGC

## Product hierarchy

```text
Teacher
  ↓
Formation (PSR, ADA, later AEPE…)
  ↓
Subject (Mathématiques, Français…)
  ↓
Subject pathway / interactive content
  ↓
Class session
  ↓
Learner activity / progress
```

The catalogue starts at formation level. Programme-family metadata such as CAP/Bac Pro may exist later but is not a navigation layer unless it becomes useful.

## Identity model

### Staff
- `users` owns a stable teacher/admin identity.
- Each staff member receives a high-entropy generated token.
- Only SHA-256(token) is stored because the token has cryptographic entropy; this is not password hashing.
- Successful login creates a separate opaque browser session stored server-side.
- Browser cookie is HttpOnly + SameSite=Strict (+ Secure on HTTPS).
- Token rotation revokes existing browser sessions for that user.
- Normal offboarding is reversible `active=false`, not deletion.

### Learners
No account system in V1. A class-session URL is a signed bearer link distributed by QR/code. Learner identity/progress is attached to that Portail class session. This keeps onboarding lightweight without carrying forward the legacy Maths authentication/session stack.

## Catalogue

The initial local catalogue is intentionally tiny:
- `psr` → `psr-maths` (`internal`; native migration starts with `rentree-v1`)
- `ada` → `ada-francais` (`internal`)
- `ada` → `ada-maths` (`internal`, foundation numeracy V1)

The former `maths.lagrandeclasse.fr` runtime remains a legacy compatibility surface for existing cohorts only. It is not a catalogue implementation target for new sessions.

Later, catalogue ownership can move to Moodle/Roads without changing the teacher-facing Formation → Subject mental model.

## Shared teacher workspaces

Every active subject exposes the same five teacher workspaces natively in Portail:

1. **Séances** — create/reopen a class session and obtain the learner entry point.
2. **Parcours** — inspect the course freely in teacher/preview mode.
3. **Corrigés** — control when learner corrections become visible.
4. **Suivi en direct** — presence, progress, results and indicative pace during a session.
5. **Rapports** — post-session group synthesis, learner detail and later cross-group comparison.

The labels and order are product-level vocabulary. New course development must not create a second subject-specific teacher shell. An unavailable workspace should remain visible with a clear status such as **en cours** or **à venir** rather than disappear. Legacy external sessions may still be linked from recent-session history while their cohort is active.

The five workspaces also define the teacher information architecture. The catalogue home remains a launcher; after entering a workspace, the same five labels become the persistent primary teacher navigation. A course/sequence may then expose a separate secondary navigation for pedagogical steps. Never mix those two levels: **teacher job navigation answers “what do I need to do?”; sequence navigation answers “where am I in the course?”**.

## Internal activity adapter

PSR Mathematics, ADA French and ADA Mathematics share the same session infrastructure: teacher-owned class session, preloaded roster, signed learner link, opaque learner id, activity events, 4-second live follow-up and descriptive reports. The frontend selects a subject/pathway-specific learner start function and completion item while keeping identity/session handling common.

This is the preferred pattern for future internal interactive subjects: reuse the session/identity/report shell and add only subject-specific activities and interpretation rules.

## Class sessions

A class session belongs to exactly one teacher, formation and subject. It carries:
- session number + optional title;
- free-form group label;
- corrections locked by default;
- active/closed state; closing is a reversible revocation switch for learner access and automatically relocks corrections;
- deterministic signed learner URL.

For all new native Portail sessions, including PSR Maths, teacher ownership is direct through the Portail identity. Historical sessions on `maths.lagrandeclasse.fr` remain separate and accessible through their existing legacy ownership/management mechanisms; no destructive migration is required.

## Reports and teacher controls

Internal subjects expose teacher-owned reports from the same activity data used by live follow-up. Reports intentionally stay descriptive: roster/start/completion counts, item-level attempts/completions and learner detail. PSR Maths additionally preserves explicit « Je ne sais pas » signals by item and learner. Cross-group comparison is only shown for sessions with the same session number/title and must never be presented as a ranking.

Roster corrections are reversible where possible: names may be corrected after activity starts, but removing a learner is refused once activity events exist so recorded work is not silently destroyed. Corrections remain locked by default and are toggled per class session by the owning teacher. Closing a session preserves all activity/report data but makes its signed learner URL unusable until the owning teacher reopens it.

## Live follow-up

V1 target is 3–5 second polling. The browser pauses polling while its tab is hidden and resumes with an immediate refresh when visible again. For classroom-sized groups this is operationally simpler than WebSockets and still feels live. If server-to-browser push becomes useful, SSE is the preferred next step before a bidirectional WebSocket layer.

## Moodle convergence

Portail is the canonical field-testing workspace, but later Moodle convergence must keep boundaries explicit:
- authentication, cohorts and durable enrolment → Moodle;
- programme/pathway orchestration → Roads;
- authored ordinary content → Moodle / Course Factory;
- interactive activities worth keeping → reusable web modules/adapters.

Avoid features that make this portal a competing LMS.
