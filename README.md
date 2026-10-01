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
- **ADA** → Mathematics / numeracy (internal foundation V1)

The portal intentionally does not recreate Moodle. It focuses on teacher sessions, interactive learning content and lightweight learner follow-up.

## Teacher workflow

1. Open `portail.lagrandeclasse.fr` and enter the personal teacher token once.
2. The server creates a secure browser session; the teacher name/role come from the account, not from a form field.
3. Choose a formation, then a subject.
4. Create a class session with a group and optional title. For ADA French, choose **Positionnement** or **Entraînement**; the choice is stored on the session and follows its signed learner link.
5. For ADA French or ADA Mathematics, open **Suivi en direct** and preload the roster (one learner per line, optional `Prénom; Nom`). Practice sessions use the same prepared-roster identity flow but remain excluded from positioning reports/corrections.
6. Share the signed learner URL or QR code.
7. Learners select their prepared identity; they do not type their name.
8. When a session is finished, close it from **Mes séances récentes**. The learner link/QR stops working immediately; results and Reports remain available.
9. Reopen a closed session later if needed.

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

## Field validation

Automated tests do not replace classroom/device checks. The current manual checklist lives in `docs/field-validation-checklist.md`. Maths SSO ownership/recovery has now been manually validated phone → desktop; the remaining check is that Portail's aggregated **Mes séances récentes** surface exposes the remote Maths session and deep-links to the intended follow-up.

## Image bank tooling

The offline curation pipeline for learning-card/Memory visuals lives in `tools/image_bank.py`. It searches Wikimedia Commons and Openverse, downloads candidate previews with provenance/licence metadata, ranks candidates heuristically, generates a local selection gallery with one-click suggestions, applies a selection manifest, audits the selected corpus and packages it as a ZIP.

Start with:

```bash
python tools/image_bank.py collect \
  --manifest tools/image-bank-seed-fr.json \
  --output .image-bank \
  --providers wikimedia,openverse \
  --per-provider 4
```

See `docs/image-bank-pipeline.md` for the full workflow and licence-review boundary.

## Tests

```bash
python -m unittest discover -s tests -v
python -m compileall -q server.py portal tests
node --check assets/app.js
```

## Deployment

Production target: `https://portail.lagrandeclasse.fr` on the existing LGC VPS `173.212.214.227`, behind the shared Traefik v3 network.

The deployment workflow mirrors `maths_lgc`: GitHub Actions checks out the exact `main` commit and synchronises it to `/opt/portail` over a dedicated SSH key. The VPS therefore does **not** need GitHub credentials or a repository deploy key.

Required repository Actions secrets:

- `DEPLOY_SSH_KEY` — private ed25519 key dedicated to `Kiwinokoto/portail`; only its public half is installed in the VPS `root` account;
- `DEPLOY_KNOWN_HOSTS` — pinned SSH host-key line for `173.212.214.227`;
- `PORTAIL_APP_SECRET` — stable random secret (32+ characters) used to sign learner-session links.

The workflow preserves `/opt/portail/data` and `.env`, builds only the portal image, starts/updates only `portail_lgc`, waits for the Docker healthcheck, verifies the Traefik route locally, then verifies the public HTTPS endpoint.

Before the first deployment, DNS for `portail.lagrandeclasse.fr` must point to the LGC VPS.

After the first successful deployment, create the first administrator manually so the one-time token is printed only in the trusted SSH terminal, never in Actions logs:

```bash
ssh root@173.212.214.227
cd /opt/portail
docker compose exec -T portail python server.py init-admin --name "Kevin"
```

Store the printed admin token securely; do not commit it or place it in Actions secrets.
