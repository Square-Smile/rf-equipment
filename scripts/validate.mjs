#!/usr/bin/env node
// validate.mjs — CI gate for v1/rf-equipment.json (stdlib only).
//
// Usage: node scripts/validate.mjs [--previous <path>]
//
// Runs the app's own validator (scripts/equipment-validate.mjs, a verbatim copy
// of KlarFunk's js/equipment-validate.js) and then the repo-only rules:
//   - every ranged manufacturers row cites a "primary" (manufacturer's own
//     document) source, unless its brand||series||band key is in pending-audit.json
//   - every non-empty preset band has a primary presetSource, unless its
//     "system||band" key is in pending-audit.json presetBands
//   - every pending-audit entry must still exist AND still be non-primary, so
//     the audit list can only shrink honestly
//   - with --previous: the version must strictly increase whenever content changed
//   - the file bytes must equal JSON.stringify(pkg, null, 2) + "\n" (no
//     reformatting, no key sorting)

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EQUIPMENT_MAX_BYTES,
  compareListVersions,
  validateEquipmentPackage,
} from "./equipment-validate.mjs";

const root = new URL("..", import.meta.url);
const pathOf = (rel) => fileURLToPath(new URL(rel, root));

const errors = [];
const err = (m) => errors.push(m);

function readCapped(path) {
  const size = statSync(path).size;
  if (size > EQUIPMENT_MAX_BYTES) {
    throw new Error(path + " is " + size + " bytes (max " + EQUIPMENT_MAX_BYTES + ")");
  }
  return readFileSync(path, "utf8");
}

function main() {
  const args = process.argv.slice(2);
  let previousPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--previous") previousPath = args[++i];
    else throw new Error("unknown argument: " + args[i]);
  }
  if (args.includes("--previous") && !previousPath) throw new Error("--previous needs a path");

  const dataPath = pathOf("v1/rf-equipment.json");
  const text = readCapped(dataPath);
  const pkg = JSON.parse(text);

  let baseline;
  let previousText = null;
  if (previousPath) {
    previousText = readCapped(previousPath);
    baseline = JSON.parse(previousText);
  }

  const res = validateEquipmentPackage(pkg, {
    baseline,
    byteLength: Buffer.byteLength(text, "utf8"),
  });
  if (!res.ok) {
    for (const e of res.errors) err("[" + res.reason + "] " + e);
    return;
  }

  // Formatting pin.
  if (JSON.stringify(pkg, null, 2) + "\n" !== text) {
    err("file is not JSON.stringify(pkg, null, 2) + newline (no reformatting or key sorting)");
  }

  const audit = JSON.parse(readCapped(pathOf("pending-audit.json")));
  const auditRows = new Set(Array.isArray(audit.rows) ? audit.rows : []);
  const auditBands = new Set(Array.isArray(audit.presetBands) ? audit.presetBands : []);

  const isPrimary = (id) =>
    typeof id === "string" && Object.hasOwn(pkg.sources, id) && pkg.sources[id].tier === "primary";

  // Manufacturers rows.
  const seenRows = new Map();
  for (const r of pkg.manufacturers) {
    const key = r.brand + "||" + r.series + "||" + r.band;
    seenRows.set(key, r);
    if (typeof r.freqStart !== "number") continue; // advisory rows carry no range
    if (!isPrimary(r.source) && !auditRows.has(key)) {
      err("row " + key + ": source is not tier \"primary\" and the row is not in pending-audit.json");
    }
  }
  for (const key of auditRows) {
    const r = seenRows.get(key);
    if (!r) err("pending-audit row has no matching manufacturers row (stale): " + key);
    else if (isPrimary(r.source)) err("pending-audit row is already primary (remove it from the list): " + key);
  }

  // Preset bands.
  const seenBands = new Set();
  for (const sys of Object.keys(pkg.presetTables)) {
    for (const band of Object.keys(pkg.presetTables[sys])) {
      let channels = 0;
      for (const g of Object.keys(pkg.presetTables[sys][band])) {
        channels += Object.keys(pkg.presetTables[sys][band][g]).length;
      }
      if (channels === 0) continue; // empty stubs carry no frequencies
      const key = sys + "||" + band;
      seenBands.add(key);
      const ps = pkg.presetSources && pkg.presetSources[sys] && pkg.presetSources[sys][band];
      if (!ps || !isPrimary(ps.source)) {
        if (!auditBands.has(key)) {
          err("preset band " + key + ": no primary presetSource and not in pending-audit.json presetBands");
        }
      } else if (auditBands.has(key)) {
        err("pending-audit preset band is already primary (remove it from the list): " + key);
      }
    }
  }
  for (const key of auditBands) {
    if (!seenBands.has(key)) err("pending-audit preset band has no non-empty preset band (stale): " + key);
  }

  // Version must increase when content changed.
  if (previousText !== null && previousText !== text) {
    const c = compareListVersions(pkg.version, baseline.version);
    if (c === null) err("version or previous version is malformed");
    else if (c <= 0) err("version " + pkg.version + " must be greater than previous " + baseline.version);
  }

  console.log(
    "rf-equipment " + pkg.version + ": " + pkg.manufacturers.length + " rows, " +
    Object.keys(pkg.presetTables).length + " preset systems; pending manufacturer-sheet audit: " +
    (auditRows.size + auditBands.size) + " entries (" + auditRows.size + " rows + " +
    auditBands.size + " preset band)",
  );
}

try {
  main();
} catch (e) {
  err(String((e && e.message) || e));
}

if (errors.length) {
  console.error("VALIDATION FAILED (" + errors.length + "):");
  for (const e of errors.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("OK");
