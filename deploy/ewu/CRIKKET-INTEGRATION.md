# Crikket → Kan Integration (Patch)

Push auf `EWU-GmbH/crikket` ist für diesen Agenten **nicht** freigeschaltet
(`403 Permission denied to cursor[bot]`). Die fertige Umsetzung liegt deshalb
als Patch hier und lokal auf Branch `cursor/kan-integration-09e8` in
`/tmp/crikket`.

## Anwenden (mit Schreibrechten auf crikket)

```bash
git clone https://github.com/EWU-GmbH/crikket.git
cd crikket
git checkout -b cursor/kan-integration-09e8
git apply /path/to/kan/deploy/ewu/crikket-kan-integration.patch
# oder: git am < crikket-kan-integration.patch
bun install
```

## Server-Env (Coolify / report.ewu.tools)

Nur **serverseitig** (nie `NEXT_PUBLIC_*`):

```bash
KAN_BASE_URL=https://kan.ewu.tools
KAN_API_KEY=kan_…          # API-Key eines Users mit Zugang zu Workspace Businessplan
KAN_BUGS_LIST_PUBLIC_ID=e6a333d69f2c              # Board app.businesswisser.de → Bugs
KAN_FEATURE_REQUESTS_LIST_PUBLIC_ID=41f75d877d19  # Board app.businesswisser.de → Feature Requests
```

Ziel-Board: Workspace **Businessplan** (`jzlsx66v76m2`) → Board
**app.businesswisser.de** (`92381e771662`).

Ältere EWU/Crikket-Listen (`bcj9ygu32fj5` / `sru6aee09wjs`) nicht mehr verwenden.

## Verhalten

| Fluss | Ergebnis |
| --- | --- |
| Bug-Report finalize | Card auf Kan-Liste **Bugs** (fire-and-forget) |
| Widget → Feature Request | `POST /api/embed/feature-requests` → Kan **Feature Requests**, **kein** Crikket-Report |

### Kan-Karteninhalt (Bugs)

- **Titel:** Reporter-Beschreibung (Fallback: Capture-/Page-Title)
- **Beschreibung:** Text + Seite + Priority + absoluter Link
  `https://report.ewu.tools/s/<reportId>`

### Widget: Feature Request

Das Capture-SDK braucht den Button **Feature Request** im Chooser
(nicht nur Video/Screenshot). Aktuelles Bundle:

- `https://report.ewu.tools/crikket-capture.js` (Caddy static)
- Business Plan Buddy: `public/crikket-capture.js` (Lovable/Railway)

Server-Endpoint: `POST /api/embed/feature-requests` → Kan-Liste
`KAN_FEATURE_REQUESTS_LIST_PUBLIC_ID`.

### Ops-Hinweis (Coolify)

`web` nutzt `network_mode: service:server`. **Nie nur den Server-Container
neu starten** — sonst verliert `web` das Netzwerk, `report.ewu.tools` liefert
502 und das Embed-Widget verschwindet. Immer `server` + `web` (+ `caddy`)
gemeinsam recreaten, oder den ganzen Crikket-Service in Coolify stoppen/starten.

Lokales Image: `ewu-crikket-server:kan-integration` (`pull_policy: never`).

## Bitte an JW

Schreibzugriff für den Cursor-Bot (oder manuelles Mergen des Patches) auf
`EWU-GmbH/crikket` freigeben, damit der Branch gepusht und deployed werden kann.
