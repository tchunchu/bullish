/**
 * config.js — Default parameters matching VCS-FCE Super Signal v5.3 Pine Script inputs
 */

export default {
  // ── Signal Thresholds ───────────────────────────────────────────
  tech_strong_th: 70.0,
  tech_bull_th:   55.0,
  tech_neut_th:   42.0,
  tech_weak_th:   28.0,
  up_strong:      15.0,
  up_ok:           5.0,
  g4_ex_rr:        2.0,
  g4_ac_rr:        1.0,
  stop_struct_pct:  3.0,

  // ── Technical Core ──────────────────────────────────────────────
  fast_len:          3,
  slow_len:         20,
  intensity_trig:   35.0,
  mid_trig:         12.0,
  vol_multiplier:    1.4,
  short_ma_len:     20,
  rsi_len:          14,
  obv_ema_len:      20,
  pivot_len:        20,
  sqz_pct:         20.0,
  maturity_n:        5,
  maturity_k:        3,
  narrow_ratio:     0.75,
  ad_pos_edge:      0.35,
  ob_len:            5,
  ob_max:           12,
  ob_mit_mode:  'Wick',

  // ── Trend Pattern ───────────────────────────────────────────────
  trend_ema_fast:   10,
  trend_ema_slow:   30,
  breather_max_bars: 3,

  // ── Portfolio & Sizing ──────────────────────────────────────────
  portfolio_size: 500000,
  risk_pct_inp:     0.75,
  max_alloc_pct:    7.5,

  // ── Macro Regime ────────────────────────────────────────────────
  enable_macro:  true,
  macro_ro_th:   60.0,
  macro_nt_th:   40.0,
  macro_hyst:     4.0,
  macro_smooth:   5,
  alloc_invest:  80.0,
  alloc_neutral: 55.0,
  alloc_cash:    25.0,
  sahm_trig:      0.50,
  sahm_warn:      0.30,
  inv_lookbk:    252,
  steep_trig:     0.30,
  houst_bad:    -10.0,

  // ── FRED API ────────────────────────────────────────────────────
  fredApiKey: process.env.FRED_API_KEY || '',

  // ── Screener ────────────────────────────────────────────────────
  chartDays: 365,
  concurrency: 8,
  minBars: 60,
  maxResults: 100,
  topForNeural: 10,
};
