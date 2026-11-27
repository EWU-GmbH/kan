# EWU Kan — Self-Hosting (kan.ewu.tools)

Self-hosted Kan for EWU. Images are **built locally from this fork**
(`EWU-GmbH/kan`) so EWU-specific code (such as the Crikket integration and
"Rückfrage an Melder") ships with the deployment.

This is a **self-host** deployment — `NEXT_PUBLIC_KAN_ENV` stays **unset** (never
`cloud`), which keeps Stripe/billing and cloud-only behaviour disabled.

## Files

- `docker-compose.coolify.yml` — **Coolify stack**: `migrate` (run-once),
  `web`, `postgres`. Coolify Traefik handles reverse-proxy + TLS; no Caddy.
- `.env.example` — variable reference to mirror into Coolify Environment Variables.

## Coolify (EWU Tools → production)

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Project / Env    | `EWU Tools` → `production`                                         |
| Application      | `kan` (`k13ibf0q1ndgzds5loh0u8n1`)                                 |
| Target Branch    | `main` (commit `HEAD`)                                             |
| Build Pack       | `dockercompose` (Base Directory `/`)                               |
| Compose Location | `/deploy/ewu/docker-compose.coolify.yml`                           |
| Domain on `web`  | `kan.ewu.tools` (`ports: - "3000"`)                                |
| Postgres Volume  | `kan_postgres_data` → `k13ibf0q1ndgzds5loh0u8n1_kan-postgres-data` |

### Notes for `main` and `v0.7.0+`

- **Exact service and volume names:** `migrate`, `web`, `postgres`, and volume
  `kan_postgres_data` must stay unchanged. With Coolify's
  `compose_parsing_version=5`, `kan_postgres_data` resolves to
  `k13ibf0q1ndgzds5loh0u8n1_kan-postgres-data` so existing data is preserved.
- **Self-built images only:** Both `migrate` and `web` build from
  `apps/web/Dockerfile` without a `ghcr.io` `image:` tag alongside `build:`.
- **No public Postgres port:** `postgres` has no `ports:` mapping and is only
  reachable on the internal Coolify network.
- **Distroless `web` image & healthcheck:** `apps/web/Dockerfile` builds `web`
  on `gcr.io/distroless/nodejs20-debian12` (no `curl` or `wget`). Do not add a
  `curl`/`wget` healthcheck. On `v0.7.0+`, HTTP `GET /api/health` on port `3000`
  (or `/nodejs/bin/node` with `fetch`) is available if a healthcheck is enabled.
- **Migrations:** `migrate` runs Drizzle migrations before `web` starts
  (`depends_on: migrate: condition: service_completed_successfully`). Leave
  `RUN_MIGRATIONS` unset on `web` when using the separate `migrate` service.

### Required environment variables in Coolify

All variable names below must exist in Coolify's **Environment Variables** (not
only in `.env` on disk, because Coolify regenerates `.env` on deploy):

| Variable                                  | Notes                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                      | 32+ char auth secret                                                           |
| `BETTER_AUTH_TRUSTED_ORIGINS`             | Trusted origin(s), e.g. `https://<KAN_DOMAIN>`                                 |
| `NEXT_PUBLIC_BASE_URL`                    | Public URL (`https://<KAN_DOMAIN>`)                                            |
| `NEXT_PUBLIC_ALLOW_CREDENTIALS`           | `true` for email/password login                                                |
| `NEXT_PUBLIC_DISABLE_SIGN_UP`             | `false` initially, `true` to lock down sign-up                                 |
| `NEXT_PUBLIC_DISABLE_EMAIL`               | `true` unless SMTP is configured                                               |
| `NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY` | `true`                                                                         |
| `POSTGRES_DB`                             | Database name (default `kan_db`)                                               |
| `POSTGRES_USER`                           | Database user (default `kan`)                                                  |
| `POSTGRES_PASSWORD`                       | Strong DB password                                                             |
| `POSTGRES_URL`                            | `postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>` |
| `KAN_ADMIN_API_KEY`                       | Admin API key (server-side only)                                               |
| `CRIKKET_BASE_URL`                        | Crikket base URL for reporter follow-up lookups                                |
| `CRIKKET_API_KEY`                         | Shared secret matching Crikket `KAN_WEBHOOK_SECRET`                            |
| `REDIS_URL`                               | Optional Redis connection URL (empty falls back to in-memory)                  |
| `LOG_LEVEL`                               | `info`                                                                         |
| `APP_VERSION`                             | Optional build arg                                                             |

Do **not** set `NEXT_PUBLIC_KAN_ENV`.

## Server-side integration: Crikket ↔ Kan

All Kan API keys and `CRIKKET_API_KEY` are **server-side only** and must never
be exposed to the browser/widget.

- **Crikket → Kan (`POST /api/v1/cards`):** Crikket creates cards via Better Auth
  API key (`Authorization: Bearer <API_KEY>` or `x-api-key: <API_KEY>`) for a
  user with `card:create` permission (and from `v0.7.0+`, board membership or
  workspace admin role on target regular boards).
- **Kan → Crikket (`crikketRouter`):** Uses `CRIKKET_BASE_URL` and
  `CRIKKET_API_KEY` from `web` runtime environment to look up linked feature
  requests and send reporter follow-up emails.

Active Crikket target IDs (`Businessplan` / `app.businesswisser.de`):

| Entity                          | `publicId`     |
| ------------------------------- | -------------- |
| Workspace **Businessplan**      | `jzlsx66v76m2` |
| Board **app.businesswisser.de** | `92381e771662` |
| List **Bugs**                   | `e6a333d69f2c` |
| List **Feature requests**       | `41f75d877d19` |
