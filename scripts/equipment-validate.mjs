/**
 * equipment-validate.js — all-or-nothing validator for the equipment package
 * (schemaVersion 1) plus the date-based list-version comparator.
 *
 * SHARED VERBATIM with Square-Smile/rf-equipment, where this exact file is
 * scripts/equipment-validate.mjs. The two copies must be updated together:
 * the repo CI and the app must agree on what a valid package is. For that
 * reason this module has ZERO imports and touches no DOM, no globals, no I/O.
 *
 * validateEquipmentPackage(pkg, { baseline, byteLength }) never throws.
 * It returns { ok: true, version } or
 *         { ok: false, reason: "schema" | "invalid" | "too-large", errors: [..max 50] }.
 *
 * The app accepts source tier "dealer" and a null preset source; enforcing the
 * manufacturer-document ("primary") rule is the repo CI's job, with its
 * explicit pending-audit allowlist. Unknown extra keys are ignored on purpose
 * (forward compatibility: old binaries keep working when fields are added).
 */

export const EQUIPMENT_SCHEMA_VERSION = 1;
export const EQUIPMENT_MAX_BYTES = 1048576; // 1 MiB
export const MHZ_MIN = 24;
export const MHZ_MAX = 6000;

const MAX_ERRORS = 50;
const MAX_DEPTH = 12;
const MAX_ROWS = 5000;
const MAX_MAP_KEYS = 2000;
const MAX_PRESET_VALUES = 50000;
const MAX_NAME = 200; // brand / series / band
const MAX_TITLE = 500;
const MAX_URL = 1000;
const MAX_NOTE = 2000;

const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
const DEVICE_TYPES = ["mic", "iem", "wmas", "radio", "advisory"];
const FREQUENCY_MODELS = [
  "band_range_free_tune", "group_channel_only", "bank_channel_plus_free_tune",
  "bank_channel_preset_only", "block_free_tune", "channel_preset_only",
  "programmed_channel", "advisory", "channel_wheel_only",
];
const INPUT_MODES = ["standard", "programmed_channel", "advisory", "channel_only"];
const DEFAULT_INPUT_MODES = ["mhz", "gc", null];
const URL_RE = /^https:\/\/[^\s.]+\.[^\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION_RE = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d{1,3}))?$/;

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** "2026-10-15" / "2026-10-15.1" → [y, m, d, n] (n = 0 when absent), or null. */
export function parseListVersion(v) {
  if (typeof v !== "string") return null;
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return [y, mo, d, m[4] === undefined ? 0 : Number(m[4])];
}

/** -1 / 0 / 1, or null when either side is malformed. The suffix compares as a number. */
export function compareListVersions(a, b) {
  const pa = parseListVersion(a), pb = parseListVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 4; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const isMhz = (v) => typeof v === "number" && Number.isFinite(v) && v >= MHZ_MIN && v <= MHZ_MAX;

function findForbiddenKey(node, depth, path) {
  if (depth > MAX_DEPTH) return path + ": nested too deep";
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const r = findForbiddenKey(node[i], depth + 1, path + "[" + i + "]");
      if (r) return r;
    }
    return null;
  }
  for (const k of Object.keys(node)) {
    if (FORBIDDEN_KEYS.includes(k)) return path + ": forbidden key \"" + k + "\"";
    const r = findForbiddenKey(node[k], depth + 1, path + "." + k);
    if (r) return r;
  }
  return null;
}

const rowId = (r) => String(r && r.brand) + "||" + String(r && r.series) + "||" + String(r && r.band);

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export function validateEquipmentPackage(pkg, options) {
  const opts = options || {};
  const errors = [];
  const err = (m) => { if (errors.length < MAX_ERRORS) errors.push(m); };
  const fail = (reason) => ({ ok: false, reason, errors });

  try {
    if (typeof opts.byteLength === "number" && opts.byteLength > EQUIPMENT_MAX_BYTES) {
      err("package is " + opts.byteLength + " bytes (max " + EQUIPMENT_MAX_BYTES + ")");
      return fail("too-large");
    }
    if (!isObj(pkg)) { err("top level is not an object"); return fail("invalid"); }

    // schemaVersion: an integer that is not ours is "schema"; anything else is malformed.
    if (typeof pkg.schemaVersion !== "number" || !Number.isInteger(pkg.schemaVersion)) {
      err("schemaVersion is not an integer");
      return fail("invalid");
    }
    if (pkg.schemaVersion !== EQUIPMENT_SCHEMA_VERSION) {
      err("unsupported schemaVersion " + pkg.schemaVersion);
      return fail("schema");
    }

    const forbidden = findForbiddenKey(pkg, 0, "$");
    if (forbidden) { err(forbidden); return fail("invalid"); }

    if (parseListVersion(pkg.version) === null) err("version is not a calendar date (YYYY-MM-DD[.n])");

    for (const k of ["sources", "taxonomy", "bandAliases", "presetTables", "presetSources", "familyToSystem"]) {
      if (!isObj(pkg[k])) err(k + " is not an object");
    }
    for (const k of ["manufacturers", "legacyBands"]) {
      if (!Array.isArray(pkg[k])) err(k + " is not an array");
    }
    if (errors.length) return fail("invalid");

    for (const k of ["manufacturers", "legacyBands"]) {
      if (pkg[k].length > MAX_ROWS) err(k + " has more than " + MAX_ROWS + " rows");
    }
    for (const k of ["sources", "taxonomy", "bandAliases", "presetTables", "presetSources", "familyToSystem"]) {
      if (Object.keys(pkg[k]).length > MAX_MAP_KEYS) err(k + " has more than " + MAX_MAP_KEYS + " keys");
    }
    if (errors.length) return fail("invalid");

    // ---- sources
    for (const id of Object.keys(pkg.sources)) {
      const s = pkg.sources[id];
      if (!isObj(s)) { err("sources." + id + " is not an object"); continue; }
      if (!isStr(s.title, MAX_TITLE)) err("sources." + id + ".title");
      if (!(typeof s.url === "string" && s.url.length <= MAX_URL && URL_RE.test(s.url) && !s.url.includes("/.../"))) {
        err("sources." + id + ".url is not an https URL");
      }
      if (!(typeof s.retrieved === "string" && DATE_RE.test(s.retrieved))) err("sources." + id + ".retrieved");
      if (s.tier !== "primary" && s.tier !== "dealer") err("sources." + id + ".tier");
    }

    // ---- rows
    const checkRow = (r, where, allowNullSource) => {
      if (!isObj(r)) { err(where + " is not an object"); return; }
      const id = where + " " + rowId(r);
      if (!isStr(r.brand, MAX_NAME)) err(id + ": brand");
      if (!isStr(r.series, MAX_NAME)) err(id + ": series");
      if (!isStr(r.band, MAX_NAME)) err(id + ": band");
      if (!DEVICE_TYPES.includes(r.deviceType)) err(id + ": deviceType");
      if (r.note !== null && r.note !== undefined && !(typeof r.note === "string" && r.note.length <= MAX_NOTE)) err(id + ": note");
      const advisory = r.freqStart === null || r.freqStart === undefined;
      if ((r.deviceType === "advisory") !== advisory) err(id + ": only advisory rows lack a range");
      if (!advisory) {
        const okRange = isMhz(r.freqStart) && isMhz(r.freqEnd) && r.freqStart < r.freqEnd;
        if (!okRange) { err(id + ": range"); }
        if (r.stepKhz !== null && r.stepKhz !== undefined && !(Number.isFinite(r.stepKhz) && r.stepKhz > 0)) err(id + ": stepKhz");
        const seg = r.segments;
        if (seg !== null && seg !== undefined) {
          if (!Array.isArray(seg) || seg.length < 2) err(id + ": segments");
          else if (okRange) {
            let prev = -Infinity;
            for (const pair of seg) {
              if (!Array.isArray(pair) || pair.length !== 2) { err(id + ": segment shape"); break; }
              const [a, b] = pair;
              if (!(Number.isFinite(a) && Number.isFinite(b) && a < b && a >= r.freqStart && b <= r.freqEnd && a >= prev)) {
                err(id + ": segment " + a + "-" + b);
              }
              prev = b;
            }
            if (seg[0] && seg[0][0] !== r.freqStart) err(id + ": segments do not span the range");
            else if (seg[seg.length - 1] && seg[seg.length - 1][1] !== r.freqEnd) err(id + ": segments do not span the range");
          }
        }
        if (!allowNullSource && r.source === null) err(id + ": ranged row without a source");
      }
      if (r.source !== null && r.source !== undefined) {
        if (typeof r.source !== "string" || !has(pkg.sources, r.source)) err(id + ": unknown source id");
      } else if (!allowNullSource && !advisory) {
        err(id + ": ranged row without a source");
      }
    };
    const seen = new Set();
    pkg.manufacturers.forEach((r, i) => {
      checkRow(r, "manufacturers[" + i + "]", false);
      const key = rowId(r);
      if (seen.has(key)) err("duplicate row " + key);
      seen.add(key);
    });
    const legacySet = new Set();
    pkg.legacyBands.forEach((r, i) => {
      checkRow(r, "legacyBands[" + i + "]", true);
      legacySet.add(rowId(r));
    });
    if (errors.length >= MAX_ERRORS) return fail("invalid");

    // ---- taxonomy
    for (const key of Object.keys(pkg.taxonomy)) {
      const t = pkg.taxonomy[key];
      if (!isObj(t)) { err("taxonomy." + key + " is not an object"); continue; }
      if (!FREQUENCY_MODELS.includes(t.frequencyModel)) err("taxonomy." + key + ".frequencyModel");
      if (!INPUT_MODES.includes(t.inputMode)) err("taxonomy." + key + ".inputMode");
      if (!DEFAULT_INPUT_MODES.includes(t.defaultInputMode)) {
        err("taxonomy." + key + ".defaultInputMode");
      }
    }
    for (const r of pkg.manufacturers) {
      if (isObj(r) && !has(pkg.taxonomy, r.brand + " — " + r.series)) err("no taxonomy entry for " + r.brand + " — " + r.series);
    }

    // ---- aliases
    for (const from of Object.keys(pkg.bandAliases)) {
      const to = pkg.bandAliases[from];
      if (to !== null && typeof to !== "string") { err("bandAliases." + from + " target"); continue; }
      if (seen.has(from)) err("bandAliases." + from + ": still a current row");
      if (to === null ? !legacySet.has(from) : !seen.has(to)) err("bandAliases." + from + " -> " + to + ": dangling");
    }
    for (const k of legacySet) if (seen.has(k)) err(k + ": both a legacy and a current row");

    // ---- preset tables + their sources
    let values = 0;
    for (const sys of Object.keys(pkg.presetTables)) {
      const bands = pkg.presetTables[sys];
      if (!isObj(bands)) { err("presetTables." + sys + " is not an object"); continue; }
      for (const band of Object.keys(bands)) {
        const groups = bands[band];
        if (!isObj(groups)) { err("presetTables." + sys + "." + band + " is not an object"); continue; }
        let finite = 0;
        for (const group of Object.keys(groups)) {
          const chans = groups[group];
          if (!isObj(chans)) { err("presetTables." + sys + "." + band + "." + group + " is not an object"); continue; }
          for (const ch of Object.keys(chans)) {
            const v = chans[ch];
            values++;
            if (v === null) continue;
            if (!isMhz(v)) { err("presetTables." + sys + "." + band + "." + group + "." + ch + ": implausible MHz"); continue; }
            finite++;
          }
        }
        const entry = has(pkg.presetSources, sys) && isObj(pkg.presetSources[sys]) && has(pkg.presetSources[sys], band)
          ? pkg.presetSources[sys][band] : undefined;
        if (finite >= 1 && !isObj(entry)) err("presetSources." + sys + "." + band + " is missing");
        if (isObj(entry)) {
          const where = "presetSources." + sys + "." + band;
          if (entry.source !== null && (typeof entry.source !== "string" || !has(pkg.sources, entry.source))) err(where + ".source");
          if (!Array.isArray(entry.citations) || !entry.citations.every((c) => typeof c === "string")) err(where + ".citations");
          else if (entry.source === null && entry.citations.length === 0) err(where + ": null source needs citations");
          if (entry.note !== null && entry.note !== undefined && typeof entry.note !== "string") err(where + ".note");
        }
      }
    }
    if (values > MAX_PRESET_VALUES) err("presetTables has more than " + MAX_PRESET_VALUES + " values");

    // ---- familyToSystem
    for (const fam of Object.keys(pkg.familyToSystem)) {
      const sys = pkg.familyToSystem[fam];
      if (!has(pkg.taxonomy, fam)) err("familyToSystem." + fam + ": no taxonomy key");
      if (typeof sys !== "string" || !has(pkg.presetTables, sys)) err("familyToSystem." + fam + ": missing system");
    }

    // ---- monotonic vs baseline: taxonomy and alias keys only ever grow
    const base = opts.baseline;
    if (isObj(base)) {
      for (const k of Object.keys(isObj(base.taxonomy) ? base.taxonomy : {})) {
        if (!has(pkg.taxonomy, k)) err("taxonomy key dropped: " + k);
      }
      for (const k of Object.keys(isObj(base.bandAliases) ? base.bandAliases : {})) {
        if (!has(pkg.bandAliases, k)) err("bandAliases key dropped: " + k);
      }
    }

    if (errors.length) return fail("invalid");
    return { ok: true, version: pkg.version };
  } catch (e) {
    err("validator error: " + (e && e.message));
    return fail("invalid");
  }
}
