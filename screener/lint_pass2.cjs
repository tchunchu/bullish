#!/usr/bin/env node
/**
 * lint_pass2.cjs — HARD GATE for LLM Pass-2 output.
 *
 * MUST exit 0 before render_v5.cjs is allowed to run.
 * Any exit code ≠ 0 means the LLM must fix pass2.json and re-submit.
 *
 * Usage:
 *   node screener/lint_pass2.cjs screener/pass2.json screener/screener_dump.json
 *
 * Error codes:
 *   E101  pass2 is not a parseable JSON array of objects
 *   E102  missing / empty required key  (sym, conviction, hold, thesis, invalidation, fuel)
 *   E103  conviction not an integer 1–10
 *   E104  hold not one of: days | weeks | months
 *   E105  sym not present in screener_dump.json candidates (invented ticker)
 *   E106  earningsRisk=true in dump but conviction > 4  (binary-event sizing rule)
 *   E107  fuel is a placeholder ("n/a", "-", "none", "tbd", etc.)
 *         Must either state the catalyst found, OR write exactly:
 *         "No fresh catalyst found in 7-day search"  (proves the search ran)
 *   E108  a price-like decimal in thesis/invalidation is not traceable to that
 *         candidate's dump values — i.e. the LLM invented a number
 *   E109  word-count violation: thesis ≤40 w, invalidation ≤20 w, fuel ≤25 w
 *   E110  a TRIGGERED candidate in dump is missing from pass2  (must be rated)
 */
'use strict';

const fs = require('fs');

// ─── Args ─────────────────────────────────────────────────────────────────
const [,, pass2File = 'screener/pass2.json', dumpFile = 'screener/screener_dump.json'] = process.argv;

// ─── Load & parse ─────────────────────────────────────────────────────────
const errors = [];
const err = (code, msg) => errors.push(`${code}: ${msg}`);

let pass2, dump;
try   { pass2 = JSON.parse(fs.readFileSync(pass2File, 'utf8')); }
catch (e) { console.error(`E101: cannot parse ${pass2File}: ${e.message}`); process.exit(1); }
try   { dump  = JSON.parse(fs.readFileSync(dumpFile,  'utf8')); }
catch (e) { console.error(`E101: cannot parse ${dumpFile}: ${e.message}`);  process.exit(1); }

if (!Array.isArray(pass2) || pass2.some(x => typeof x !== 'object' || x === null)) {
  console.error('E101: pass2.json must be a JSON array of objects — got: ' + typeof pass2);
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const REQUIRED    = ['sym', 'conviction', 'hold', 'thesis', 'invalidation', 'fuel'];
const VALID_HOLDS = ['days', 'weeks', 'months'];
const PLACEHOLDER = /^(n\/?a|none|nil|-{1,3}|—|tbd|\s*)$/i;
const words       = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const bySym = Object.fromEntries((dump.candidates || []).map(c => [c.sym, c]));

// Build the set of valid dump numbers for each candidate (for E108)
function dumpNumbers(cand) {
  const valid = new Set();
  const add = v => {
    if (typeof v === 'number' && isFinite(v)) {
      valid.add(v.toFixed(2));
      valid.add(String(v));
    }
  };
  [cand.price, cand.rs, cand.medDollarVolM, cand.earningsInDays].forEach(add);
  if (cand.setup) Object.values(cand.setup).forEach(v => add(v));
  if (cand.tape)  Object.values(cand.tape).forEach(v  => add(v));
  if (cand.fund)  Object.values(cand.fund).forEach(v  => add(v));
  // Also add nested compression parts if present
  if (cand.setup?.compression?.parts) Object.values(cand.setup.compression.parts).forEach(v => {
    if (Array.isArray(v)) v.forEach(add); else add(v);
  });
  return valid;
}

// ─── Validate each row ────────────────────────────────────────────────────
for (const row of pass2) {
  const tag = row.sym || '(no sym)';

  // E102 — required keys
  for (const k of REQUIRED) {
    if (row[k] === undefined || row[k] === null || String(row[k]).trim() === '')
      err('E102', `${tag}: missing/empty field "${k}"`);
  }

  // E103 — conviction range
  if (!Number.isInteger(row.conviction) || row.conviction < 1 || row.conviction > 10)
    err('E103', `${tag}: conviction must be integer 1–10, got: ${JSON.stringify(row.conviction)}`);

  // E104 — hold enum
  if (!VALID_HOLDS.includes(row.hold))
    err('E104', `${tag}: hold must be one of days|weeks|months, got: "${row.hold}"`);

  // E105 — sym must exist in dump
  const cand = bySym[row.sym];
  if (!cand) {
    err('E105', `${tag}: symbol not found in screener_dump.json candidates — invented ticker`);
    continue; // can't do further checks without the dump row
  }

  // E106 — earnings binary-event cap
  if (cand.earningsRisk === true && row.conviction > 4)
    err('E106', `${tag}: earningsRisk=true but conviction ${row.conviction} > 4 — size for the gap or cap at 4`);

  // E107 — fuel must not be a placeholder
  if (row.fuel != null && PLACEHOLDER.test(String(row.fuel).trim()))
    err('E107', `${tag}: fuel is a placeholder ("${row.fuel}"). ` +
      `Either state the catalyst, or write exactly: "No fresh catalyst found in 7-day search"`);

  // E108 — no invented price-like numbers in thesis or invalidation
  const valid = dumpNumbers(cand);
  const cited = String((row.thesis || '') + ' ' + (row.invalidation || '')).match(/\d+\.\d{1,2}/g) || [];
  for (const n of cited) {
    const norm = parseFloat(n).toFixed(2);
    if (![...valid].some(v => parseFloat(v).toFixed(2) === norm))
      err('E108', `${tag}: number "${n}" in thesis/invalidation not traceable to this candidate's dump values — invented number`);
  }

  // E109 — word limits
  if (words(row.thesis)       > 40) err('E109', `${tag}: thesis is ${words(row.thesis)} words — max 40`);
  if (words(row.invalidation) > 20) err('E109', `${tag}: invalidation is ${words(row.invalidation)} words — max 20`);
  if (words(row.fuel)         > 25) err('E109', `${tag}: fuel is ${words(row.fuel)} words — max 25`);
}

// E110 — every TRIGGERED candidate must appear in pass2
for (const c of (dump.candidates || [])) {
  if (c.setup?.state === 'TRIGGERED' && !pass2.some(r => r.sym === c.sym))
    err('E110', `${c.sym}: state=TRIGGERED in dump but missing from pass2 — all TRIGGERED names must be rated`);
}

// ─── Result ───────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`\n❌ lint_pass2: ${errors.length} error(s)\n`);
  errors.forEach(e => console.error('  ' + e));
  console.error('\n→ Fix pass2.json and rerun lint before calling render_v5.cjs.\n');
  process.exit(1);
}

console.log(`✅ lint_pass2: ${pass2.length} rows clean — proceed to render_v5.cjs`);
