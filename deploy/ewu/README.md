# EWU Kan — Self-Hosting (kan.ewu.tools)

Self-hosted Kan for EWU on DigitalOcean (Frankfurt), mirroring the Crikket
setup on `report.ewu.tools`: **Caddy** terminates TLS and reverse-proxies to a
**Kan web** container, with a **bundled Postgres**. Images are **built from this
fork** (`EWU-GmbH/kan`) so EWU-specific code (e.g. the Crikket → Kan
integration) ships with the deployment.

This is a **self-host** deployment — `NEXT_PUBLIC_KAN_ENV` stays **unset** (never
`cloud`), which keeps Stripe/billing and cloud-only behaviour disabled.

## Files

- `docker-compose.yml` — `caddy`, `web`, `migrate` (run-once), `postgres`.
- `Caddyfile` — automatic HTTPS + reverse proxy for `${KAN_DOMAIN}`.
- `.env.example` — copy to `.env` and fill in.

## Prerequisites

- A DigitalOcean droplet in Frankfurt (FRA) with Docker + compose plugin.
- DNS: an **A record** for `kan.ewu.tools` → the droplet's public IP.
- Ports **80** and **443** open in the droplet firewall (needed for Let's Encrypt).

## Deploy

```bash
# on the droplet
git clone https://github.com/EWU-GmbH/kan.git
cd kan/deploy/ewu
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET, POSTGRES_PASSWORD, POSTGRES_URL password,
# KAN_ADMIN_API_KEY, ACME_EMAIL, etc.
docker compose up -d --build
docker compose logs -f web
```

The `migrate` container runs Drizzle migrations once and exits; `web` starts
only after it completes successfully. Caddy obtains a certificate for
`kan.ewu.tools` automatically on first request.

### Managing

- Logs: `docker compose logs -f web` (or `caddy`, `migrate`, `postgres`)
- Update to latest fork code: `git pull && docker compose up -d --build`
- Stop: `docker compose down` (data persists in the `kan_postgres_data` volume)

### First run

1. Open `https://kan.ewu.tools`, sign up the initial admin account(s).
2. Set `NEXT_PUBLIC_DISABLE_SIGN_UP=true` in `.env` and
   `docker compose up -d` to lock down public sign-up.

## Server-side integration: Crikket → Kan

All Kan API access is **server-side only** — the credential must never reach the
browser/widget.

- **Auth options for the REST API (`/api/v1/*`):**
  - Better Auth **API key** — send `Authorization: Bearer <API_KEY>` or
    `x-api-key: <API_KEY>` (the app resolves a session from the key).
  - A valid **session cookie** (verified working end-to-end against the built
    image: `POST /api/v1/cards` → `200 {"publicId": "..."}`).
- **Provisioning the service API key (part 3 task):** the Better Auth
  self-service endpoint `POST /api/auth/api-key/create` currently returns `403`
  for a normal user session, so the Crikket service key must be minted through a
  trusted path — e.g. a small server-side script using the Better Auth server
  API, or by enabling key creation for the service account. Store the resulting
  key in Crikket's server secrets only.
- `KAN_ADMIN_API_KEY` (sent as `x-admin-api-key`) authorizes the admin-only
  procedures, not `card:create`.
- **Create a card** (used for Crikket bugs and widget feature requests):

  ```http
  POST https://kan.ewu.tools/api/v1/cards
  Authorization: Bearer <API_KEY>
  Content-Type: application/json

  {
    "title": "Bug: ...",
    "description": "Reported via Crikket ...",
    "listPublicId": "<12-char list publicId>",
    "labelPublicIds": [],
    "memberPublicIds": [],
    "position": "end"
  }
  ```

  The API key's user must have `card:create` permission in the workspace that
  owns `listPublicId`. Look up board/list `publicId`s via the corresponding
  `GET /api/v1/...` endpoints (OpenAPI spec at `/api/v1/openapi.json`).

Flow to wire up (in the Crikket backend, not this repo):

1. **Crikket bugs → Kan cards:** on bug creation, Crikket's backend calls
   `POST /api/v1/cards` against the target "Bugs" list.
2. **Widget feature requests → Kan directly:** the feature-request path posts
   to a Crikket backend endpoint which forwards to `POST /api/v1/cards` on the
   "Feature requests" list — **without** creating a Crikket report.

Keep the Kan API key in Crikket's server-side secrets only.
