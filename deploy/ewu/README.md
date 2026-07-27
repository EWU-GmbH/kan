# EWU Kan — Self-Hosting (kan.ewu.tools)

Self-hosted Kan for EWU on DigitalOcean (Frankfurt). Images are **built from this
fork** (`EWU-GmbH/kan`) so EWU-specific code (e.g. the Crikket → Kan
integration) ships with the deployment.

This is a **self-host** deployment — `NEXT_PUBLIC_KAN_ENV` stays **unset** (never
`cloud`), which keeps Stripe/billing and cloud-only behaviour disabled.

## Files

- `docker-compose.coolify.yml` — **preferred on Coolify**: `web`, `migrate`
  (run-once), `postgres`. Coolify Traefik handles reverse-proxy + TLS; no Caddy.
- `docker-compose.yml` — standalone Droplet stack with bundled **Caddy** (TLS).
- `Caddyfile` — used only by the standalone compose.
- `.env.example` — copy to `.env` (standalone) or mirror into Coolify envs.

## Coolify (EWU Tools → production)

Live resource (created via Coolify API):

| Field | Value |
| --- | --- |
| Project / Env | `EWU Tools` → `production` |
| Application | `kan` (`k13ibf0q1ndgzds5loh0u8n1`) |
| Branch | `cursor/coolify-kan-deploy-f3b3` (until merged) |
| Compose | `/deploy/ewu/docker-compose.coolify.yml` |
| Domain on `web` | `https://kan.ewu.tools` |

### Setup checklist

1. Create a **Docker Compose** application from this repo (base `/`, compose path above).
2. Attach domain **`https://kan.ewu.tools`** to the **`web`** service
   (Coolify Traefik proxy/TLS — do not publish 80/443 from the compose).
3. Set required envs (see below), then deploy. The `migrate` container runs
   Drizzle migrations once; `web` starts after it succeeds.
4. **DNS (required for Let's Encrypt):** create an **A record**
   `kan.ewu.tools` → `104.248.136.0` at the udag DNS for `ewu.tools`
   (`ns.udag.de` / `ns.udag.net` / `ns.udag.org`). Without it Traefik serves the
   default cert and ACME fails with `NXDOMAIN`. After DNS propagates, restart
   the `web` container (or redeploy) so Traefik retries ACME.

### Required environment variables

| Variable | Example / notes |
| --- | --- |
| `BETTER_AUTH_SECRET` | 32+ char secret |
| `POSTGRES_PASSWORD` | strong password |
| `POSTGRES_URL` | `postgresql://kan:<POSTGRES_PASSWORD>@postgres:5432/kan_db` |
| `NEXT_PUBLIC_BASE_URL` | `https://kan.ewu.tools` |
| `NEXT_PUBLIC_ALLOW_CREDENTIALS` | `true` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `https://kan.ewu.tools` |

Do **not** set `NEXT_PUBLIC_KAN_ENV`.

### First run

1. Open `https://kan.ewu.tools`, sign up the initial admin account(s).
2. Set `NEXT_PUBLIC_DISABLE_SIGN_UP=true` and redeploy to lock down sign-up.

## Standalone (Caddy on the Droplet)

Only if Coolify is not used (ports 80/443 free on the host):

```bash
git clone https://github.com/EWU-GmbH/kan.git
cd kan/deploy/ewu
cp .env.example .env
# fill BETTER_AUTH_SECRET, POSTGRES_PASSWORD, POSTGRES_URL, …
docker compose up -d --build
```

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

### Part 3 checklist (prepare after Smoke-Test)

Seeded on the Coolify instance during smoke-test (public IDs only):

| Entity | `publicId` |
| --- | --- |
| Workspace **EWU** | `6cpeij3lcd5x` |
| Board **Crikket Bugs** | `7ia2a9abkak6` |
| List **Bugs** | `bcj9ygu32fj5` |
| List **Feature requests** | `sru6aee09wjs` |

1. Mint a Better Auth API key for a user with `card:create`
   (`POST /api/auth/api-key/create` works for a normal session on this build;
   keep the key server-side only). Verified: `Authorization: Bearer` and
   `x-api-key` both return `200` on `POST /api/v1/cards`.
2. Store in **Crikket** server secrets only:
   - `KAN_BASE_URL=https://kan.ewu.tools`
   - `KAN_API_KEY=<bearer/x-api-key>`
   - `KAN_BUGS_LIST_PUBLIC_ID=bcj9ygu32fj5`
   - `KAN_FEATURE_REQUESTS_LIST_PUBLIC_ID=sru6aee09wjs`
3. Implement Crikket server handlers that `POST /api/v1/cards` with
   `Authorization: Bearer` or `x-api-key` (never from the widget).
4. Ops note with the live API key is on the droplet at
   `/root/kan-part3-notes.txt` (mode `600`, not in git).
