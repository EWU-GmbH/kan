# EWU · Kan Self-Host & Crikket-Integration — Handoff

Kontext-Übergabe für einen neuen Cloud-Agenten, damit nahtlos weitergearbeitet
werden kann. Antworten mit dem Nutzer bitte auf **Deutsch**.

## Vollständigen Verlauf nachlesen (optional)

Der bisherige Verlauf liegt im Cloud-Agent-Lauf
`bc-7597cc3c-5019-49e7-bef2-ef2bb6428ebb`
(https://cursor.com/agents/bc-7597cc3c-5019-49e7-bef2-ef2bb6428ebb).
Als neuer Agent im selben Repo/Team lässt sich das Transkript via MCP ziehen:
`cursor-cloud · batch-fetch-details` mit `bc_ids=["bc-7597cc3c-5019-49e7-bef2-ef2bb6428ebb"]`,
`include_transcripts=true` (Transkript per Subagent lesen, nicht direkt).

## Ziele (Gesamtauftrag)

1. **Kan self-hosten** unter **kan.ewu.tools** auf DigitalOcean (Droplet
   `104.248.136.0`, Frankfurt) — via **Coolify v4** (nicht Railway für Prod).
   Self-Host: **`NEXT_PUBLIC_KAN_ENV` bleibt UNGESETZT** (kein `cloud`).
2. EWU-Deploy-Setup vorbereiten/deployen (Docker Compose / Caddy / Env).
3. **Integration Crikket ↔ Kan:**
   - Crikket-**Bugs** → Kan-**Cards** (Liste „Bugs").
   - **Feature-Wünsche** aus dem Crikket-**Widget** → **direkt an Kan** (Liste
     „Feature Requests"), **ohne** einen Crikket-Report zu erzeugen.
   - **API-Keys nur serverseitig** (nie im Browser/Widget).

## Aktueller Stand

- **Push-Rechte** auf `EWU-GmbH/kan`: bestätigt.
- **PR #1** (`cursor/setup-dev-environment-8ebb`): Dev-Env-Doku (AGENTS.md).
- **PR #2** (`cursor/ewu-selfhost-deploy-8ebb`): EWU-Deploy-Setup unter
  `deploy/ewu/` (docker-compose, Caddyfile, .env.example, README). Lokal mit
  echtem Docker gebaut + getestet (Migrationen, Caddy-TLS, UI-Smoke-Test,
  `POST /api/v1/cards`).
- **Kan ist LIVE**: `https://kan.ewu.tools` läuft auf dem Coolify-Droplet,
  **gültiges Let's-Encrypt-Zert** (CN=kan.ewu.tools), App antwortet `200`,
  `/api/auth/ok` → `{"ok":true}`. In Coolify: Environment **„EWU Tools ›
  production"**, Application-Name **„kan"**.
- **Hinweis Domain:** `kan.ewu-web.de` zeigt auf einen **anderen** Server
  (`178.77.78.140`, liefert 404) — **nicht** nutzen. Kanonische URL ist
  **kan.ewu.tools**.

## OFFENER BUG (zuerst fixen)

„**Workspace konnte nicht erstellt werden**" (Frontend-Catch-all → 500 auf der
Live-Instanz). **Kein Code-Bug**: Auf identischem Docker-Image lokal
reproduziert → Workspace-Create liefert `200`. Ursache liegt in der
**Live-Konfiguration/DB**. Zu prüfen (Coolify → App „kan"):

1. **Migrationen**: Das `web`-Image (distroless, `bootstrap.cjs`) migriert
   **nicht** selbst. Nötig ist der separate **`migrate`**-Schritt
   (`drizzle-kit migrate` gegen `POSTGRES_URL`). Sicherstellen, dass er gegen
   dieselbe DB gelaufen ist und das Schema vollständig ist.
2. **`POSTGRES_URL`** muss gesetzt sein und auf die echte Postgres zeigen
   (sonst PGlite-Fallback = ephemer/unvollständig).
3. **`NEXT_PUBLIC_KAN_ENV`** MUSS ungesetzt sein (kein `cloud`).
4. **`NEXT_PUBLIC_BASE_URL`** und **`BETTER_AUTH_TRUSTED_ORIGINS`** =
   `https://kan.ewu.tools`.
5. Echte Fehlermeldung aus den **kan-Web-Container-Logs** ziehen (Coolify Logs
   bzw. `docker logs`).

Danach neu deployen und per Smoke-Test verifizieren: Workspace → Board → Card.

## Zugänge (als Runtime Secrets gesetzt, in NEUEN Läufen als Env-Var verfügbar)

- `COOLIFY_API_TOKEN` — Coolify-API (`http://104.248.136.0:8000/api/v1`,
  Bearer). Test: `GET /api/v1/version`.
- `DO_SSH_PRIVATE_KEY` — SSH `root@104.248.136.0` (Port 22 offen). In
  `~/.ssh/id_ed25519` schreiben (chmod 600), Host-IP `104.248.136.0`.
- Optional `COOLIFY_URL` (Default `http://104.248.136.0:8000`).

Wichtig: Secrets werden nur beim **VM-Start** eingespeist. Der bisherige Lauf
`bc-7597cc3c…` wurde vor dem Setzen gestartet und hat sie NICHT — deshalb dieser
Handoff an einen frischen Lauf.

## Kan-Einrichtung (nach Bug-Fix)

1. Workspace anlegen (z. B. `EWU`).
2. Board `Crikket` mit Listen **`Bugs`** und **`Feature Requests`**.
3. **Settings → API keys → Create** → Key `kan_…` (Prefix `kan_`, via
   `authClient.apiKey.create` in der UI). Wert nur serverseitig in Crikket
   ablegen.
4. Beide **`listPublicId`** (12-stellig) ermitteln und festhalten.

## Integrations-Contract (Teil 3, Kan-Seite steht)

- **Endpoint:** `POST https://kan.ewu.tools/api/v1/cards`
- **Auth:** `Authorization: Bearer kan_…` oder `x-api-key: kan_…`
  (Better-Auth apiKey-Plugin; `enableSessionForAPIKeys: true`).
- **Body:**
  ```json
  {
    "title": "…", "description": "…",
    "listPublicId": "<12-char>",
    "labelPublicIds": [], "memberPublicIds": [],
    "position": "end"
  }
  ```
- Der Key-User braucht `card:create` im Workspace der Liste.
- OpenAPI: `https://kan.ewu.tools/api/v1/openapi.json`.
- Verifiziert: ohne Auth `401`; mit gültiger Session `200 {"publicId":…}`.

**Crikket-Seite (eigenes Repo — noch anfordern):**
- Bug angelegt → `POST /api/v1/cards` (Liste „Bugs").
- Widget-Feature-Wunsch → Crikket-Backend-Endpoint → `POST /api/v1/cards`
  (Liste „Feature Requests"), **ohne** Crikket-Report.
- `KAN_BASE_URL=https://kan.ewu.tools` + `KAN_API_KEY=kan_…` als serverseitige
  Secrets in Crikket. **Repo-Name/Org von JW erfragen.**

## Nächste Schritte für den neuen Agenten

1. Zugang verifizieren (Coolify-API; sonst SSH).
2. Workspace-Create-Bug fixen (siehe „OFFENER BUG"), neu deployen, Smoke-Test.
3. Kan einrichten (Workspace/Board/Listen/API-Key, listPublicIds ausgeben).
4. Crikket-Repo erfragen und Teil 3 dort implementieren.
