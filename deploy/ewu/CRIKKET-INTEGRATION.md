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
KAN_API_KEY=kan_…          # siehe Droplet /root/kan-part3-notes.txt
KAN_BUGS_LIST_PUBLIC_ID=bcj9ygu32fj5
KAN_FEATURE_REQUESTS_LIST_PUBLIC_ID=sru6aee09wjs
```

## Verhalten

| Fluss | Ergebnis |
| --- | --- |
| Bug-Report finalize | Card auf Kan-Liste **Bugs** (fire-and-forget) |
| Widget → Feature Request | `POST /api/embed/feature-requests` → Kan **Feature Requests**, **kein** Crikket-Report |

## Bitte an JW

Schreibzugriff für den Cursor-Bot (oder manuelles Mergen des Patches) auf
`EWU-GmbH/crikket` freigeben, damit der Branch gepusht und deployed werden kann.
