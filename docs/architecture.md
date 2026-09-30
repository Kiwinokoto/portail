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
- `ada` → `ada-maths` (`planned`)

Later, catalogue ownership can move to Moodle/Roads without changing the teacher-facing Formation → Subject mental model.

## Class sessions

A class session belongs to exactly one teacher, formation and subject. It carries:
- session number + optional title;
- free-form group label;
- corrections locked by default;
- active/closed state;
- deterministic signed learner URL.

Teacher ownership replaces the old Maths per-session management secret for normal management. The teacher can therefore recover old sessions on another device simply by authenticating again.

## Live follow-up

V1 target is 3–5 second polling. For classroom-sized groups this is operationally simpler than WebSockets and still feels live. If server-to-browser push becomes useful, SSE is the preferred next step before a bidirectional WebSocket layer.

## Moodle convergence

The temporary portal must keep boundaries explicit:
- authentication, cohorts and durable enrolment → Moodle;
- programme/pathway orchestration → Roads;
- authored ordinary content → Moodle / Course Factory;
- interactive activities worth keeping → reusable web modules/adapters.

Avoid features that make this portal a competing LMS.
