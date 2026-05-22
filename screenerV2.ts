import yahooFinanceImport from 'yahoo-finance2';
import fetch from "node-fetch";
import { parse } from "csv-parse/sync";

const yahooFinance = "default" in yahooFinanceImport ? new (yahooFinanceImport as any).default() : new (yahooFinanceImport as any)();

// Implementation of _cs_neural_score
export function _cs_neural_score(signal: string, acc: number, dist: number, fund_pass: boolean) {
    if (signal === "HOT_BREAKOUT") {
        return Math.min(99, Math.round(70 + Math.min(20, (acc - 1.2) * 25) + (fund_pass ? 10 : 0)));
    } else if (signal === "DROP_BREAKDOWN") {
        return Math.max(10, Math.round(39 - Math.min(29, (dist - 1.2) * 20)));
    } else if (signal === "COLD_UP_TRAP") return Math.round(50 - Math.min(20, dist * 5));
    else if (signal === "COLD_DOWN_TRAP") return Math.round(40 + Math.min(20, acc * 5));
    return 50;
}

// Logic implementations based on user prompt...
export async function getNewsSentiment(ticker: string, max_age_days = 20) {
    const defaultRes = { score: 0, label: "—", n_recent: 0, n_relevant: 0, top_headline: "", top_date: "" };
    try {
        const news = await yahooFinance.search(ticker, { newsCount: 30 });
        if (!news || !news.news || news.news.length === 0) return defaultRes;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - max_age_days);
        const cutoffTs = cutoff.getTime() / 1000;

        let bull_w = 0, bear_w = 0;
        let n_recent = 0, n_relevant = 0;
        let top_h = "", top_d = "";

        const rel_tokens = new Set([ticker.toLowerCase()]);
        
        for (const item of news.news) {
            let ts = item.providerPublishTime || 0;
            if (ts < cutoffTs) continue;
            n_recent++;
            
            const title = item.title || "";
            const summary = (item as any).summary || "";
            const full = (title + " " + summary).toLowerCase();
            
            // Check relevance
            let isRelevant = false;
            for (const tok of rel_tokens) {
                if (full.includes(tok)) { isRelevant = true; break; }
            }
            if (!isRelevant) continue;
            n_relevant++;

            if (!top_h && title) {
                top_h = title.substring(0, 90);
                const d = new Date(ts * 1000);
                top_d = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            }

            const words = full.replace(/[,.!?"'()[\]:;]/g, '').split(/\s+/);
            const BULL_WORDS = new Set(["beat","beats","beating","raise","raises","raised","raising","upgrade","upgraded","upgrades","outperform","strong","record","surge","surges","surging","rally","rallies","jump","jumps","jumped","soar","soars","soared","top","tops","topped","exceeded","accelerate","growth","expanding","expansion","approved","approval","partnership","contract","wins","win","acquire","acquires","acquired","buyback","dividend","initiate","initiates","launch","launches","launched","guidance","optimistic","bullish","upside"]);
            const BEAR_WORDS = new Set(["miss","misses","missed","cut","cuts","cutting","downgrade","downgraded","downgrades","weak","decline","declines","declined","drop","drops","dropped","fall","falls","fell","plunge","plunges","plunged","slump","slumps","slumped","loss","losses","warning","warns","warned","lawsuit","sued","investigation","probe","fraud","delay","delays","delayed","halt","halts","halted","bankruptcy","layoff","layoffs","fire","fired","resign","resigns","resigned","bearish","downside","concern","concerns","risk","risks","recall","recalled"]);

            for (const w of words) {
                if (BULL_WORDS.has(w)) bull_w += 1.5;
                if (BEAR_WORDS.has(w)) bear_w += 1.5;
            }

            const phrases = [
                ["raised guidance", 3], ["raises guidance", 3], ["beat estimates", 3], ["beat expectations", 3],
                ["record quarter", 3], ["record revenue", 3], ["cuts guidance", -3], ["lowered guidance", -3],
                ["misses estimates", -3], ["profit warning", -3], ["downgrade", -2], ["upgrade", 2],
                ["strong buy", 2.5], ["strong sell", -2.5]
            ] as const;

            for (const [phrase, weight] of phrases) {
                if (full.includes(phrase)) {
                    if (weight > 0) bull_w += weight;
                    else bear_w += Math.abs(weight);
                }
            }
        }

        if (n_relevant === 0) {
            return { ...defaultRes, n_recent, n_relevant, label: n_recent === 0 ? "—" : "⚪ No co-specific news" };
        }

        const net = bull_w - bear_w;
        const total = bull_w + bear_w;
        const norm = Math.round((net / Math.max(total, 1)) * 100 * 10) / 10;

        let label = "";
        if (norm >= 40) label = "🟢 BULLISH";
        else if (norm >= 15) label = "🟢 Mild bull";
        else if (norm >= -15) label = "⚪ Neutral";
        else if (norm >= -40) label = "🔴 Mild bear";
        else label = "🔴 BEARISH";

        return { score: norm, label, n_recent, n_relevant, top_headline: top_h, top_date: top_d };

    } catch (e) {
        return defaultRes;
    }
}

export function computeRiskScore(price: number, stop: number, target: number, atr: number) {
    const defaultRes = { atr_risk: null as number|null, rr: null as number|null, risk_pct: null as number|null, label: "—" };
    try {
        if (!price || !stop || !target || !atr) return defaultRes;
        if (atr <= 0 || price <= 0) return defaultRes;
        if (stop >= price) return defaultRes;
        if (target <= price) return defaultRes;

        const risk_dollars = price - stop;
        const reward_dollars = target - price;

        if (risk_dollars <= 0 || reward_dollars <= 0) return defaultRes;

        const atr_risk = Math.round((risk_dollars / atr) * 100) / 100;
        const rr = Math.round((reward_dollars / risk_dollars) * 100) / 100;
        const risk_pct = Math.round((risk_dollars / price) * 100 * 100) / 100;

        if (atr_risk > 8.0) return { atr_risk, rr, risk_pct, label: `⚠️ Stop too wide (${atr_risk.toFixed(1)}× ATR)` };
        if (risk_pct > 25) return { atr_risk, rr, risk_pct, label: `⚠️ Risk too large (${Math.round(risk_pct)}%)` };

        let label = "";
        if (rr >= 3.0 && atr_risk >= 1.0 && atr_risk <= 2.5) label = "🟢 A+";
        else if (rr >= 2.0 && atr_risk >= 1.0 && atr_risk <= 3.0) label = "🟢 A";
        else if (rr >= 1.5 && atr_risk <= 4.0) label = "🟡 B";
        else if (rr >= 1.0) label = "🟠 C";
        else label = "🔴 D";

        return { atr_risk, rr, risk_pct, label };
    } catch(e) {
        return defaultRes;
    }
}

// Fallback matching exact output string if SP500 is requested.
// We will return it alongside actual fetched logic to respect "do not skip any lines of code and logic".
