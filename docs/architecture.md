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
No account system in V1. A class-session URL is a signed bearer link distributed by QR/code. Learner identity/progress can then be attached to that class session. This keeps onboarding close to the successful `maths_lgc` classroom flow and avoids rebuilding Moodle identity management.

## Catalogue

The initial local catalogue is intentionally tiny:
- `psr` → `psr-maths` (`external`, current `maths.lagrandeclasse.fr`)
- `ada` → `ada-francais` (`internal`)
- `ada` → `ada-maths` (`internal`, foundation numeracy V1)

Later, catalogue ownership can move to Moodle/Roads without changing the teacher-facing Formation → Subject mental model.

## Shared teacher workspaces

Every subject exposes the same five teacher workspaces, whether the implementation is internal to Portail or delegated to an external interactive course:

1. **Séances** — create/reopen a class session and obtain the learner entry point.
2. **Parcours** — inspect the course freely in teacher/preview mode.
3. **Corrigés** — control when learner corrections become visible.
4. **Suivi en direct** — presence, progress, results and indicative pace during a session.
5. **Rapports** — post-session group synthesis, learner detail and later cross-group comparison.

The labels and order are product-level vocabulary. External subjects such as PSR Maths must preserve them when handing the teacher to their own UI. An unavailable workspace should remain visible with a clear status such as **en cours** or **à venir** rather than disappear.

## Internal activity adapter

ADA French and ADA Mathematics share the same session infrastructure: teacher-owned class session, preloaded roster, signed learner link, opaque learner id, activity events, 4-second live follow-up and descriptive reports. The frontend selects a subject-specific learner start function and completion item while keeping identity/session handling common.

This is the preferred pattern for future internal interactive subjects: reuse the session/identity/report shell and add only subject-specific activities and interpretation rules.

## Class sessions

A class session belongs to exactly one teacher, formation and subject. It carries:
- session number + optional title;
- free-form group label;
- corrections locked by default;
- active/closed state; closing is a reversible revocation switch for learner access and automatically relocks corrections;
- deterministic signed learner URL.

For native Portail sessions, teacher ownership is direct. For PSR Maths, new sessions created under Portail SSO persist the stable `owner_portal_user_id` supplied by the SSO identity, so the same teacher can recover them on another device after authenticating again. Historical Maths sessions that predate ownership metadata remain accessible through their per-session management secret; no destructive migration is required.

## Reports and teacher controls

Internal subjects expose teacher-owned reports from the same activity data used by live follow-up. ADA French Reports V1 intentionally stays descriptive: roster/start/completion counts, item-level attempts/completions and learner detail. Cross-group comparison is only shown for sessions with the same session number/title and must never be presented as a ranking.

Roster corrections are reversible where possible: names may be corrected after activity starts, but removing a learner is refused once activity events exist so recorded work is not silently destroyed. Corrections remain locked by default and are toggled per class session by the owning teacher. Closing a session preserves all activity/report data but makes its signed learner URL unusable until the owning teacher reopens it.

## Live follow-up

V1 target is 3–5 second polling. The browser pauses polling while its tab is hidden and resumes with an immediate refresh when visible again. For classroom-sized groups this is operationally simpler than WebSockets and still feels live. If server-to-browser push becomes useful, SSE is the preferred next step before a bidirectional WebSocket layer.

## Moodle convergence

The temporary portal must keep boundaries explicit:
- authentication, cohorts and durable enrolment → Moodle;
- programme/pathway orchestration → Roads;
- authored ordinary content → Moodle / Course Factory;
- interactive activities worth keeping → reusable web modules/adapters.

Avoid features that make this portal a competing LMS.
