# Portail LGC

Lightweight pedagogical portal for La Grande Classe while the Moodle ecosystem is still being integrated.

## Navigation model

```text
Formation
└── Subject
    └── Subject pathway / interactive course
```

Initial catalogue:
- **PSR** → Mathematics (existing legacy course at `maths.lagrandeclasse.fr`)
- **ADA** → French / literacy
- **ADA** → Mathematics / numeracy (planned)

The portal intentionally does not recreate Moodle. It focuses on teacher sessions, interactive learning content and lightweight learner follow-up.

## Teacher workflow

1. Open `portail.lagrandeclasse.fr` and enter the personal teacher token once.
2. The server creates a secure browser session; the teacher name/role come from the account, not from a form field.
3. Choose a formation, then a subject.
4. Create a class session with a group and optional title.
5. For ADA French, open **Élèves / suivi** and preload the roster (one learner per line, optional `Prénom; Nom`).
6. Share the signed learner URL or QR code.
7. Learners select their prepared identity; they do not type their name.
8. Reopen the same sessions from any device after authenticating again.

Administrators can create/deactivate colleagues and rotate their access token. Generated teacher tokens are displayed once and stored only as SHA-256 hashes server-side.

## Local run

```bash
export PORTAIL_APP_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
python server.py init-admin --name "Kevin"
python server.py serve
```

`init-admin` prints the first high-entropy admin token once. Keep it outside Git.

Open:
- portal: `http://localhost:8080/`
- health: `http://localhost:8080/healthz`

## Environment

- `PORTAIL_HOST` — default `0.0.0.0`
- `PORTAIL_PORT` — default `8080`
- `PORTAIL_DATA_DIR` — default `./data`
- `PORTAIL_PUBLIC_URL` — default `http://localhost:8080`
- `PORTAIL_APP_SECRET` — required for production; signs learner links
- `PORTAIL_SESSION_TTL_DAYS` — default `30`

## Tests

```bash
python -m unittest discover -s tests -v
python -m compileall -q server.py portal tests
node --check assets/app.js
```

## Deployment direction

The intended target is `https://portail.lagrandeclasse.fr` on the existing LGC VPS behind the shared Traefik v3 network, following the same isolated-container pattern as `maths_lgc`. Deployment is not performed until AgentCtl and VPS deployment leases are available.
