# NOTES: rationale behind the data

These notes preserve the engineering rationale that used to live as code comments
in KlarFunk's `js/group-channel-data.js` (pre-refactor commit 564c5c2). They explain
WHY the data looks the way it does. Read them before changing `familyToSystem`,
the Budget ISM table, or any channel ORDER.

Summary of the load-bearing decisions:

- **XSW and ew 100 G4 are NOT in `familyToSystem`.** Each taxonomy family spans
  more than one model with different channel sets; mapping it would show a wrong
  frequency with full confidence. Both stay selectable by system name.
- **Budget ISM 863-865** ships only the 4 confirmed intermod-clean channels; it is
  on the pending-audit list (no manufacturer document).
- **the t.bone 823** is a band-confirmed, channel-EMPTY stub. Never invent a comb.
- **MEI 1000 G2**: each group is intermod-free within itself; mixing groups defeats that.
- **IEM-75 channel order is the manual's order. Never sort.**
- **BLX channel keys are in display order Ch0..Ch9, ChA, ChB. Never sort.**
- **LD U505 and LD U518 are no longer empty stubs (2026-10-23).** Both were transcribed
  from LD's own frequency lists (U500 list D005329). The U505 table is identical, value
  for value, to the MEI 1000 G2 B5 table already here. U518 G20 Ch7 is printed 1798.500
  (out of sequence) and is left empty. Neither is mapped in `familyToSystem` yet.
- **Series renamed 2026-10-23:** "Sennheiser — EW G4 / G5" -> "EW G4" (there is no analog
  ew G5) and "Shure — Axient Digital (ADX / AXT)" -> "Axient Digital (AD / ADX)" (AXT is
  the older analog Axient). The old row keys are aliased in `bandAliases`; the old taxonomy
  keys stay (they only grow).

The original comments follow, verbatim. (References to "Phase NN" and quick-task
ids are KlarFunk-internal planning labels.)

# Rationale comments removed from js/group-channel-data.js (pre-refactor 564c5c2)

## FAMILY_TO_SYSTEM (verbatim)
/**
 * FAMILY_TO_SYSTEM — the single source of truth mapping a Brand/Series picker
 * em-dash family key (U+2014, matching DEVICE_TAXONOMY / _brandSeriesKey) to the
 * top-level GROUP_CHANNEL_SYSTEMS system name whose preset table backs it.
 *
 * Today only Shure ULXD has a loaded G50 table. Phase 46 adds BLX / XSW / LD /
 * Sony rows here as their precise tables land — both lookup directions
 * (systemForFamily / familyForSystem) and the hasLoadedPresetTable gate
 * auto-extend with zero Phase-44 code change (C4 auto-activation).
 */
const FAMILY_TO_SYSTEM = {
  "Shure — ULXD / QLXD": "Shure ULXD",
  // Phase 45 (WHEEL-01): the ONE budget-ISM channel-wheel family key. The em-dash
  // (U+2014) key matches DEVICE_TAXONOMY exactly. This auto-extends
  // systemForFamily / familyForSystem / hasLoadedPresetTable (they iterate this
  // single source). The "the t.bone 823" stub system is intentionally NOT mapped
  // here — the form resolves channel-wheel devices against "Budget ISM 863-865"
  // only (45-RESEARCH §3.1; the 823 channel table is a [VERIFY_MANUAL] stub).
  "XVive / Fame / t.bone — Budget ISM": "Budget ISM 863-865",
  // Phase 46 (PRESET-01): the ONE mapped preset family this phase. "Shure BLX"
  // has real CITED H8+K3E tables → hasLoadedPresetTable("Shure — BLX") flips true
  // → the P44 direct-MHz fallback deactivates → the Group/Channel cascade renders
  // (ZERO equipment.js change, C4 auto-activation). The em-dash (U+2014) key is
  // verified verbatim against DEVICE_TAXONOMY (rf-data.js:199). The XSW / LD U505 /
  // LD U518 / Sony UWP-D stub systems are INTENTIONALLY NOT mapped here — they ship
  // band-confirmed but channel-empty, so the P44 direct-MHz fallback stays active
  // for those families (the "the t.bone 823" precedent; 46-RESEARCH Open Question 1).
  "Shure — BLX": "Shure BLX",
  // 261013-p81: unlike the "the t.bone 823" stub and the unmapped Sennheiser ew 100 G4,
  // this table is CITED, COMPLETE and covers the device's entire tuning set (16 of 16
  // channels), so no sub-variant can receive a wrong preset. Mapping it flips
  // hasLoadedPresetTable true and the Group/Channel cascade replaces the direct-MHz
  // fallback. Key is verbatim from DEVICE_TAXONOMY (em dash U+2014).
  "the t.bone — IEM 75 (IEM-75T)": "the t.bone IEM 75",
  // 261005-otf: the MEI 1000 G2 tables are now CITED and complete (10 groups
  // x 12 channels, both bands), so this family maps and the Group/Channel
  // cascade replaces the direct-MHz fallback. That is the point of the change:
  // the owner could only enter raw MHz, picked channels from three different
  // groups, and got dozens of IM3 findings that a single group would not have
  // produced. The key is verbatim from DEVICE_TAXONOMY.
  "LD Systems — MEI 1000 G2": "LD Systems MEI 1000 G2",
  // quick-260829-sen: "Sennheiser ew 100 G4" is DELIBERATELY NOT mapped from the
  // "Sennheiser — EW G4 / G5" taxonomy family, even though its table is fully
  // loaded and cited.
  //
  // That family spans the 100 series AND the 300/500 series, and the two do not
  // share a bank structure: ew 100 G4 is 20 banks x 12 channels, ew 300-500 G4 is
  // 26 banks x 32 (docs.cloud.sennheiser.com ew-g4 product-freq-bank). Mapping the
  // family would hand 100-series presets to a 300/500 owner — a wrong frequency
  // presented with full confidence, which is worse than no table at all.
  //
  // The system is still selectable BY NAME in the Group/Channel picker (its System
  // dropdown lists every GROUP_CHANNEL_SYSTEMS key), so a 100-series operator gets
  // the full cascade today. Map the family only once the 300/500 table is loaded
  // too, or split the taxonomy family in two.
  //
  // quick-261014-l8f: "Sennheiser — XSW 1 / XSW 2" is DELIBERATELY NOT mapped either,
  // although "Sennheiser XSW 1" and "Sennheiser XSW 2" are fully loaded and cited.
  // That one taxonomy family spans two MODELS with different channel sets: the
  // sheet's "0* / 10**" preset is channel 0 on XSW 1 and channel 10 on XSW 2, and
  // presets 11/12 exist on XSW 2 only. Mapping the family would offer an XSW 1
  // owner Ch11/Ch12 their hardware cannot tune and label the shared preset "Ch10"
  // for an operator whose front panel says 0 — a wrong frequency presented with
  // full confidence. Both systems are still selectable BY NAME in the System
  // dropdown, so the owner gets the correct cascade today. Map the family only
  // after the taxonomy family is split in two (needs a saved-equipment migration).
};

## Budget ISM 863-865 (system header comments)
  // --- Phase 45 (WHEEL-01): budget-ISM channel-wheel "system" -----------------
  // Cheap license-free EU receivers show a CHANNEL NUMBER on the wheel, never the
  // MHz. This system does the mandatory Channel→MHz lookup so the engineer sees
  // where the device actually sits (outside the coordinated 470–700 UHF band).
  //
  // It reuses the EXACT system→band→group→channel shape so resolveGC resolves it
  // with ZERO resolver change: the channel-wheel form supplies the fixed band
  // ("863-865") and group ("ISM") as constants; the user only picks the channel.
  //
  // DATA HONESTY (45-RESEARCH §1.2 + Pitfall 1/4): 863–865 MHz is only 2 MHz wide
  // at 200 kHz spacing → ~10 theoretical centres, but only 4 systems run
  // intermod-clean simultaneously. We ship ONLY the 4 CONFIRMED intermod-clean EU
  // channels (the Sennheiser-recommended CH70 4-set, quoted across the UK trade).
  // We do NOT ship a 16-channel comb (that "16" belongs to the t.bone freeU 863
  // product = 4 groups × 4 ch, not a band standard) and we do NOT invent Ch5–Ch10
  // (e.g. 863.900 is NOT a confirmed channel — the executor has no web, so an
  // invented value would ship as fact). Every value below is // CITED:.

## the t.bone 823 (system header comments)
  // --- Phase 45: the t.bone 823 family — band CONFIRMED, channel table STUB ----
  // Band 823–832 MHz ("Mittenlücke 800" / duplex gap) is CONFIRMED (TOA fact
  // sheet; licensed in the UK as part of the Channel 38 PMSE licence). The t.bone
  // freeU 823 structure is CONFIRMED as 10 groups × 10 channels on an 80 kHz grid
  // (100 channels total). But the per-channel MHz table lives ONLY on an internal
  // manual page (e.g. freeU Twin PT 823 manual p.~14) — it is NOT publicly
  // extractable, and the executor has no web tools.
  //
  // [VERIFY_MANUAL]: per-channel MHz for t.bone freeU 823 — NOT extractable, NOT
  // invented. A fabricated 80 kHz × 100 comb is exactly the safety violation the
  // DoD forbids (45-RESEARCH Pitfall 1). The group object is intentionally EMPTY:
  // resolveGC returns ok:false ("unknown channel") for every lookup here until the
  // official table is transcribed (Phase 46 / PRESET-F2). The form resolves
  // against "Budget ISM 863-865" only — this stub is NOT wired into
  // FAMILY_TO_SYSTEM (one budget-ISM family this phase, per 45-RESEARCH §3.1 +
  // Open Question 2); it exists band-confirmed for future use.

## the t.bone IEM 75 (system header comments)
  // --- 261013-p81: the t.bone IEM 75 (IEM-75T) — 16 fixed channels, CITED -------
  // Source: the t.bone IEM-75 Bedienungsanleitung, section 7.3 "Frequenztabelle",
  // p. 30, https://images.thomann.de/pics/atg/atgdata/document/manual/314071_c_314071_r7_de_online.pdf
  // (retrieved 2026-10-13). Transcribed verbatim; never invent a value.
  //
  // Why a SEPARATE system and not an edit to "Budget ISM 863-865": the two tables
  // genuinely disagree. IEM-75 Ch2 = 863.900 (generic: 863.500) and Ch3 = 864.500
  // (generic: 864.300). Serving an IEM-75 owner from the generic table is a 400 kHz
  // confident wrong answer. The generic table stays correct for the gear it describes.
  //
  // The 1..16 ordering is the MANUAL'S and is NOT a transcription error: Ch1-Ch4 are
  // a spread, intermod-friendly set (two systems may run at once); Ch5-Ch16 then fill
  // the remaining 100 kHz grid positions, so Ch5 = 863.200 sits BELOW Ch4 = 864.900.
  // Sorting ascending would change which frequency every channel number resolves to.
  // 100 kHz neighbours are below the 300 kHz CONFLICT_MIN_KHZ default, so the advisor
  // flagging same-system pairs drawn from Ch5-Ch16 is CORRECT; Ch1-Ch4 (min 400 kHz
  // apart) is the manufacturer's multi-system set.
  // Pinned by tests/js/tbone-iem-75-presets.test.mjs.

## LD Systems MEI 1000 G2 (system header comments)
  // --- 261005-otf: LD Systems MEI 1000 G2 — transcribed from the official
  // frequency list the owner supplied on 2026-10-08, closing the
  // "park the band-confirmed structure for future PDF transcription" stub.
  //
  // Each GROUP is factory-coordinated to be intermod-free WITHIN itself.
  // Mixing channels across groups discards that, which is exactly what the
  // owner hit: four IEMs drawn from Groups 1, 4 and 5 produced dozens of IM3
  // findings. Offering Group/Channel instead of raw MHz is what prevents it.

## Shure BLX (system header comments)
  // --- Phase 46 (PRESET-01): Shure BLX — the two EU-relevant bands, CITED -------
  // BLX is a fixed Group/Channel system (group_channel_only taxonomy). Both bands
  // below are transcribed VERBATIM from official Shure files — they are // CITED:
  // (sourced), not flagged-pending-confirmation. The grids are Channel-row × Group-col
  // in the source; here they are group → channel (the ULXD shape resolveGC reads).
  //
  // Channel keys are declared in DISPLAY ORDER Ch0,Ch1,…,Ch9,ChA,ChB. Object key
  // insertion order is preserved and the NaN-safe channel sort (plan 46-02) relies
  // on it ("ChA"/"ChB" → parseInt NaN; insertion order keeps them after Ch9).
  // Empty cells in the source grid → the channel key is OMITTED (resolveGC then
  // returns ok:false for that combo — honest, never a silent NaN). Group d is the
  // "Group of 12" and is the only group carrying ChA/ChB.

## Sennheiser XSW 1 (system header comments)
  // --- Phase 46 (PRESET-01): band-confirmed, channel-EMPTY VERIFY stubs ---------
  // (XSW left this section 2026-10-14, quick 261014-l8f: see the two loaded
  // "Sennheiser XSW 1" / "Sennheiser XSW 2" systems below.)
  // LD U505 / LD U518 / Sony UWP-D: the official band RANGES are confirmed,
  // but the per-channel preset MHz are manual/CDN-locked (NOT web-extractable) —
  // the executor has no web and NEVER invents an RF value. So each ships as a
  // band-confirmed system with an INTENTIONALLY EMPTY channel object (the
  // "the t.bone 823" pattern). systemHasResolvableChannel returns false for each
  // → hidden from the manual System dropdown (P45 IN-02). And — critically — NONE
  // of these are added to FAMILY_TO_SYSTEM, so hasLoadedPresetTable stays false for
  // their families and the working P44 direct-MHz fallback stays ON (the honest
  // outcome; 46-RESEARCH Pitfall 3 / Open Question 1). They park the band-confirmed
  // structure for future PDF transcription (PRESET-F2).
