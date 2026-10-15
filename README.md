# rf-equipment

Wireless microphone / IEM equipment frequency database used by **KlarFunk** (RTL-SDR RF scanner for live-sound engineers) and **FreqSense**.

This repository is the **only place equipment is edited**. KlarFunk and FreqSense vendor a copy of it at release time; KlarFunk can also download a newer list at runtime ("Update equipment list" in Settings).

## Published URL

```
https://square-smile.github.io/rf-equipment/v1/rf-equipment.json
```

Served by GitHub Pages as a static file (CORS `access-control-allow-origin: *`, `max-age=600`, so a publish can take up to about 10 minutes to appear).

### Schema major versions

The path segment (`v1`) is the schema major. A **breaking** schema change goes to a new path (`v2/`), and `v1/` keeps being published unchanged so released apps keep working. Within `v1`, only additive changes are allowed: new optional fields, new rows, new taxonomy/alias keys. Consumers ignore unknown fields.

## Schema (`schemaVersion: 1`)

Top-level keys of `v1/rf-equipment.json`, in this order:

| Key | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Always `1` in `v1/`. |
| `version` | string | List version `YYYY-MM-DD` or `YYYY-MM-DD.n` (see below). |
| `sources` | object | Source id to `{ title, url, retrieved, tier }`. `url` is https; `retrieved` is `YYYY-MM-DD`; `tier` is `primary` (the manufacturer's own document) or `dealer`. |
| `manufacturers` | array | Current band rows (see below). |
| `taxonomy` | object | Family key (`"<brand> — <series>"`, **em dash U+2014**) to `{ frequencyModel, inputMode, defaultInputMode }`. |
| `bandAliases` | object | Old band key to the current band key, or `null` when the band was removed (then it must exist in `legacyBands`). |
| `legacyBands` | array | Rows that no longer exist as current bands, same shape as `manufacturers` rows but `source` is `null`. |
| `presetTables` | object | `system` to `band` to `group` to `channel` to MHz (number, or `null` for an empty cell). Key order is meaningful (see NOTES.md). |
| `presetSources` | object | `system` to `band` to `{ source, citations, note }`. `source` is a `sources` id or `null`; `citations` is a list of strings (required when `source` is `null`); `note` is a string or `null`. Every band with at least one frequency needs an entry. |
| `familyToSystem` | object | Taxonomy family key (em dash) to the `presetTables` system whose table backs it. |

A `manufacturers` row has, in this order: `brand`, `series`, `band`, `freqStart`, `freqEnd` (MHz, 24 to 6000, `freqStart < freqEnd`), `deviceType` (`mic`, `iem`, `wmas`, `radio`, `advisory`), `stepKhz`, `segments` (`[[start, end], ...]` spanning the range, or `null`), `source` (a `sources` id; the row is *denormalised* by resolving this id through `sources`) and `note`. Only `advisory` rows have no range (`freqStart`/`freqEnd` are `null`).

`taxonomy.frequencyModel` is one of `band_range_free_tune`, `group_channel_only`, `bank_channel_plus_free_tune`, `bank_channel_preset_only`, `block_free_tune`, `channel_preset_only`, `programmed_channel`, `advisory`, `channel_wheel_only`. `inputMode` is one of `standard`, `programmed_channel`, `advisory`, `channel_only`. `defaultInputMode` is `mhz`, `gc` or `null`.

The full machine-checked rules are in `scripts/equipment-validate.mjs`.

## Editing rules

1. **The manufacturer's own document is required.** Every ranged row and every non-empty preset band must cite a source with `tier: "primary"`. The `dealer` tier is allowed **only** for entries listed in `pending-audit.json`.
2. **`pending-audit.json` can only shrink.** Once an entry is backed by a primary source, remove it from the list; CI fails on stale entries (an entry that no longer exists, or is already primary). Never add entries to make CI pass.
3. **`taxonomy` and `bandAliases` keys only ever grow.** CI compares against the previously published file and fails if a key disappears.
4. **Removed rows** move to `legacyBands` and get a `null` alias in `bandAliases`.
5. **Never sort keys or reformat.** The file must equal `JSON.stringify(data, null, 2) + "\n"` exactly. Channel order inside `presetTables` is meaningful: the **t.bone IEM-75** table is in the manual's order (Ch5 sits below Ch4), and **BLX** channels are in display order `Ch0..Ch9, ChA, ChB`. See `NOTES.md`.
6. **Never invent a frequency.** If a value is not in a document you can cite, leave it out.

### Version format

`version` is `YYYY-MM-DD`, with an optional `.n` suffix for several publishes in one day (`2026-10-15.1`). It must **strictly increase** whenever the content changes; CI enforces this against the previous published file. Apps only take a downloaded list when its version is newer than the one they already have.

## CI gate

`.github/workflows/validate-and-publish.yml` runs `node scripts/validate.mjs` on every pull request and push, and the **deploy job `needs: validate`**, so an invalid list is never published. Run it locally before pushing:

```
node scripts/validate.mjs                              # validate
node scripts/validate.mjs --previous <previous.json>   # also check version and monotonic keys
```

`scripts/equipment-validate.mjs` is a verbatim copy of KlarFunk's `js/equipment-validate.js`. The two must be updated together so the CI and the app agree on what a valid list is.

## How KlarFunk consumes it

- **Release time:** `scripts/sync-rf-equipment.sh` in KlarFunk downloads `v1/rf-equipment.json`, validates it, vendors it to `data/rf-equipment.json`, and regenerates `js/equipment-bundled.js`, which pins the SHA-256. Every KlarFunk release should sync.
- **Runtime:** Settings, Updates, "Update equipment list" (and an opt-in automatic check) fetches the published file, validates it, stores it in the app data folder and applies it in place. If anything is wrong, the current list stays active. The bundled list is used when it is the newer one.

## FreqSense switch-over

FreqSense used to copy KlarFunk's `js/rf-equipment-data.js` (a classic script that sets `globalThis.SQ_RF_EQUIPMENT`) via `bin/sync-rf-equipment.sh`. That file no longer exists in KlarFunk, so the old sync **fails loudly by design**. To switch:

1. Change the sync script to fetch `v1/rf-equipment.json` from this repo (or a checkout of it) and **pin that file's SHA-256** instead.
2. FreqSense's 40-file shared classic-script scope forbids top-level bindings, so have the sync script wrap the JSON into a script of the form `globalThis.SQ_RF_EQUIPMENT = JSON.parse(<json string>);` instead of loading a `.js` data file directly.
3. Rows reference their source by id: resolve `source` through `sources` (`sources[row.source]`), or keep reading `row.source` as a key. Previously the rows carried the source object itself.
4. `bandAliases` and `legacyBands` keep their field names and semantics, so `js/utils-band-alias.js` needs no change.
5. New in the JSON, available if wanted: `presetTables`, `presetSources`, `familyToSystem`.

## Open audit list

`pending-audit.json` lists the 11 entries that still need checking against the manufacturer's own documents: 10 dealer-sourced rows (Audio-Technica 3000 Series 4th Gen DE2, EE1, EF1, FG1; Audio-Technica 5000 Series DE1, EG1, GH1; Audio-Technica ATW-3255 DF2; AKG WMS 4500 / WMS 5000 BD7, BD8) and the generic Budget ISM 863-865 preset band. Shrinking this list is the open follow-up.

## Licence

This database is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The full legal code is in `LICENSE`.

NOTICE: © 2026 Square Smile Media / KlarFunk — Wireless equipment frequency database. When you reuse the data, give appropriate credit with this line, link to the licence, and indicate if changes were made. The scripts in `scripts/` are part of this repository and covered by the same licence.
