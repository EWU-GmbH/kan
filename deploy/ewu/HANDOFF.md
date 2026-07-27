# EWU · Kan Self-Host & Crikket-Integration — Handoff

Kontext-Übergabe für Cloud-Agenten. Antworten mit dem Nutzer bitte auf **Deutsch**.

## Vollständigen Verlauf nachlesen (optional)

- Vorgänger: `bc-7597cc3c-5019-49e7-bef2-ef2bb6428ebb`
- Dieser Lauf: `bc-04dcc2cd-07ad-4443-8ae7-c8339a1909e8`
  (via `cursor-cloud · batch-fetch-details`, `include_transcripts=true`)

## Ziele (Gesamtauftrag)

1. **Kan self-hosten** unter **kan.ewu.tools** auf DigitalOcean (Droplet
   `104.248.136.0`) via **Coolify v4**. Self-Host: **`NEXT_PUBLIC_KAN_ENV`
   bleibt UNGESETZT** (kein `cloud`).
2. EWU-Deploy-Setup (Docker Compose / Caddy / Coolify-Compose / Env).
3. **Integration Crikket ↔ Kan:**
   - Crikket-**Bugs** → Kan-**Cards** (Liste „Bugs").
   - **Feature-Wünsche** aus dem Crikket-**Widget** → **direkt an Kan** (Liste
     „Feature Requests"), **ohne** Crikket-Report.
   - **API-Keys nur serverseitig**.

## Aktueller Stand

- **Kan LIVE**: `https://kan.ewu.tools` (Let's Encrypt OK, `/api/auth/ok` → ok).
- Coolify: Project **EWU Tools** → **production**, App **kan**
  (`k13ibf0q1ndgzds5loh0u8n1`), Compose
  `/deploy/ewu/docker-compose.coolify.yml`.
- Branch für Coolify-Deploy: `cursor/ewu-selfhost-deploy-09e8` (vorher
  `cursor/coolify-kan-deploy-f3b3`).
- Env live verifiziert: `POSTGRES_URL` gesetzt, Migration Exit 0,
  `NEXT_PUBLIC_KAN_ENV` **unset**, Base-URL + Trusted-Origins =
  `https://kan.ewu.tools`.
- Zugänge funktionieren: `COOLIFY_API_TOKEN`, `DO_SSH_PRIVATE_KEY`
  (`root@104.248.136.0`).

## Workspace-Bug — ROOT CAUSE (behoben im Code)

„**Workspace konnte nicht erstellt werden**" war **kein** Config/DB-Problem.

Live-Logs zeigten:

```text
workspace.create input {"name":"businessplan","slug":""} → 400 BAD_REQUEST
slug: too_small (min 3) + invalid_string (regex)
```

Ursache: `NewWorkspaceForm` sendete immer `slug: ""`. Zod `.optional()`
akzeptiert `undefined`, aber **nicht** den leeren String. Frontend zeigte den
Catch-all „Unable to create workspace" / DE „Workspace konnte nicht erstellt
werden".

Fix:
1. Frontend: leeren Slug weglassen (`...(values.slug ? { slug } : {})`).
2. API: `z.preprocess` mappt `""`/`null` → `undefined` (Server fällt auf
   `publicId` als Slug zurück).

Smoke-Test nach Redeploy: Workspace ohne URL-Feld anlegen muss `200` liefern.

## Seed / IDs (Live)

| Entity | `publicId` |
| --- | --- |
| Workspace **EWU** | `6cpeij3lcd5x` |
| Board **Crikket** (ggf. umbenannt von „Crikket Bugs") | `7ia2a9abkak6` |
| Liste **Bugs** | `bcj9ygu32fj5` |
| Liste **Feature Requests** | `sru6aee09wjs` |

API-Key (serverseitig, Droplet `/root/kan-part3-notes.txt`, mode 600):
`KAN_API_KEY` für User `ewu-admin-…@ewu.tools`. Zusätzlich Ziel: Key mit
Prefix `kan_` via UI/Settings erzeugen.

## Integrations-Contract

- **Endpoint:** `POST https://kan.ewu.tools/api/v1/cards`
- **Auth:** `Authorization: Bearer …` oder `x-api-key: …`
- **Body:** `{ title, description, listPublicId, labelPublicIds:[], memberPublicIds:[], position:"end" }`
- OpenAPI: `https://kan.ewu.tools/api/v1/openapi.json`

**Crikket-Seite (eigenes Repo — von JW erfragen):**
- Bugs → Liste `bcj9ygu32fj5`
- Widget-Features → Liste `sru6aee09wjs` (ohne Report)
- Secrets: `KAN_BASE_URL`, `KAN_API_KEY`, `KAN_BUGS_LIST_PUBLIC_ID`,
  `KAN_FEATURE_REQUESTS_LIST_PUBLIC_ID`

## Nächste Schritte

1. Fix deployen + Smoke-Test Workspace-Create ohne Slug.
2. Board/Listen-Namen auf „Crikket" / „Bugs" / „Feature Requests" angleichen;
   `kan_`-API-Key erzeugen; IDs ausgeben.
3. Crikket-Repo bei JW erfragen und Teil 3 dort umsetzen.
