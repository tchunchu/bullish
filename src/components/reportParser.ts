// Dynamic client-side parser to translate offline high-fidelity HTML templates to native responsive objects
export function parseReportData(html: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Determine if it is scoreboard or daily news
    const isScoreboard = html.includes("Cumulative Ticker Scoreboard") || (doc.querySelector("h1")?.textContent || "").includes("Scoreboard");

    const title = doc.querySelector("h1")?.textContent || "Market Beat Report";
    const sub = doc.querySelector(".sub")?.textContent || "";

    // Parse timestamp and generatedUtc with dynamic extraction and custom fallback
    const stampEl = doc.querySelector(".stamp") || doc.querySelector(".hero .stamp") || doc.querySelector("[class*='stamp']");
    let reportTimestamp = "";
    let generatedUtc = "";
    if (stampEl) {
      reportTimestamp = stampEl.querySelector("b")?.textContent?.trim() || "";
      if (!reportTimestamp) {
        reportTimestamp = stampEl.textContent?.replace(/Report timestamp:\s*/i, "").trim() || "";
      }
      const spanText = stampEl.querySelector("span")?.textContent || "";
      const genMatch = spanText.match(/generated\s+([0-9a-zA-Z-.:_Z]+)/i);
      if (genMatch && genMatch[1]) {
        generatedUtc = genMatch[1].trim();
      }
    }
    if (!reportTimestamp) {
      const stampMatch = html.match(/Report timestamp:\s*<b>([\s\S]*?)<\/b>/i) || html.match(/Report timestamp:\s*([^<)\n\r]+)/i);
      if (stampMatch && stampMatch[1]) {
        reportTimestamp = stampMatch[1].trim();
      }
    }
    if (!reportTimestamp) {
      // Look for emoji 🕐 and get text after it
      const matchClock = html.match(/🕐\s*([^<)\n\r]+)/i);
      if (matchClock && matchClock[1]) {
        reportTimestamp = matchClock[1].trim();
      }
    }
    if (!generatedUtc) {
      const genMatch = html.match(/\(generated\s+([0-9a-zA-Z.:T_-]+)\)/i) || html.match(/generated\s+([0-9a-zA-Z.:T_-]+)/i);
      if (genMatch && genMatch[1]) {
        generatedUtc = genMatch[1].trim();
      }
    }
    if (!reportTimestamp) {
      // Find date inside of title
      const titleEl = doc.querySelector("title") || doc.querySelector("h1");
      const titleText = titleEl?.textContent || "";
      const tDateMatch = titleText.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (tDateMatch) {
        reportTimestamp = tDateMatch[0];
      }
    }
    // Final fallback to uploaded time if we cannot find it anywhere
    if (!reportTimestamp) {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      reportTimestamp = `${yyyy}-${mm}-${dd} · ${hours}:${minutes}${ampm} ET (Upload fallback)`;
    }
    if (!generatedUtc) {
      generatedUtc = new Date().toISOString();
    }

    // Common mood cells
    const moodItems: any[] = [];
    doc.querySelectorAll(".mood .cell").forEach(cell => {
      moodItems.push({
        k: cell.querySelector(".k")?.textContent?.trim() || "",
        v: cell.querySelector(".v")?.textContent?.trim() || "",
        d: cell.querySelector(".d")?.textContent?.trim() || "",
        isPos: cell.querySelector(".d")?.classList.contains("pos") || false,
        isNeg: cell.querySelector(".d")?.classList.contains("neg") || false,
        isNeu: cell.querySelector(".d")?.classList.contains("neu") || false,
      });
    });

    // Winners & Losers in leader section
    const winners: string[] = [];
    const losers: string[] = [];
    doc.querySelectorAll(".leader .lbox.win li, .leader .lbox:first-of-type li").forEach(li => {
      winners.push(li.textContent?.trim() || "");
    });
    doc.querySelectorAll(".leader .lbox.lose li, .leader .lbox:last-of-type li").forEach(li => {
      if (!winners.includes(li.textContent?.trim() || "")) {
        losers.push(li.textContent?.trim() || "");
      }
    });

    // News cards
    const newsItems: any[] = [];
    doc.querySelectorAll(".news").forEach((news) => {
      const heading = news.querySelector("h3")?.textContent?.trim() || "";
      const meta = news.querySelector(".meta")?.textContent?.trim() || "";
      const priority = news.querySelector(".pill.prio")?.textContent?.trim() || "Lv 1";
      const category = news.querySelector(".pill.cat")?.textContent?.trim() || "News";
      const confidence = news.querySelector(".pill.conf")?.textContent?.trim() || "High";
      
      // Tickers
      const tickers: any[] = [];
      news.querySelectorAll(".tk").forEach(tk => {
        tickers.push({
          text: tk.textContent?.trim() || "",
          className: tk.className
        });
      });

      // Levels
      const levels: any[] = [];
      news.querySelectorAll(".level").forEach(lvl => {
        levels.push({
          lh: lvl.querySelector(".lh")?.textContent?.trim() || "",
          lc: lvl.querySelector(".lc")?.textContent?.trim() || "",
        });
      });

      // Beneficiaries & Victims list
      const beneficiaries: string[] = [];
      news.querySelectorAll(".col.win li, .col:first-of-type li").forEach(li => {
        beneficiaries.push(li.textContent?.trim() || "");
      });
      const victims: string[] = [];
      news.querySelectorAll(".col.lose li, .col:last-of-type li").forEach(li => {
        victims.push(li.textContent?.trim() || "");
      });

      // Timeline box
      const timeline: any[] = [];
      news.querySelectorAll(".tbox").forEach(tbox => {
        timeline.push({
          b: tbox.querySelector("b")?.textContent?.trim() || "",
          text: tbox.textContent?.trim() || ""
        });
      });

      newsItems.push({
        heading,
        meta,
        priority,
        category,
        confidence,
        tickers,
        levels,
        beneficiaries,
        victims,
        timeline
      });
    });

    // Macro calendar items (highly dynamic parser supporting .ke / .kev and modern label structures)
    const macroRegime = doc.querySelector(".macro .regime")?.textContent?.trim() || "";
    const macroLede = doc.querySelector(".macro .lede")?.textContent?.trim() || doc.querySelector(".macro .summary")?.textContent?.trim() || "";
    const macroEvents: any[] = [];
    
    const eventEls = doc.querySelectorAll(".macro .ke, .macro .kev");
    eventEls.forEach(el => {
      const when = el.querySelector("[class*='when']")?.textContent?.trim() || el.querySelector(".when")?.textContent?.trim() || "";
      const kl = el.querySelector("[class*='label']")?.textContent?.trim() || el.querySelector(".kl")?.textContent?.trim() || "";
      const kv = el.querySelector("[class*='value']")?.textContent?.trim() || el.querySelector(".kv")?.textContent?.trim() || "";
      const kd = el.querySelector("[class*='detail']")?.textContent?.trim() || el.querySelector(".kd")?.textContent?.trim() || "";
      macroEvents.push({
        when,
        kl,
        kv,
        kd,
        className: el.className
      });
    });

    // Parsers for release tables/lists (.row2 layout variants)
    const row2Els = doc.querySelectorAll(".macro .row2, .macro .row-cal");
    row2Els.forEach(el => {
      const t = el.querySelector(".t, [class*='time']")?.textContent?.trim() || "";
      const e = el.querySelector(".e, [class*='event']")?.textContent?.trim() || "";
      const fp = el.querySelector(".fp, [class*='forecast']")?.textContent?.trim() || el.querySelector(".v, .val")?.textContent?.trim() || "";
      if (e) {
        macroEvents.push({
          when: t,
          kl: e,
          kv: fp,
          kd: "",
          className: "row2"
        });
      }
    });

    // Parsers for weekly outlook cells (.wcell layout variants)
    const wcellEls = doc.querySelectorAll(".macro .wcell, .macro .week-cell");
    wcellEls.forEach(el => {
      const wd = el.querySelector(".wd, [class*='day']")?.textContent?.trim() || "";
      const we = el.querySelector(".we, [class*='event']")?.textContent?.trim() || "";
      const status = el.querySelector(".status, [class*='done']")?.textContent?.trim() || "";
      if (we) {
        macroEvents.push({
          when: wd,
          kl: we,
          kv: status,
          kd: "",
          className: "wcell"
        });
      }
    });

    // ROBUST FULL-CONTENT EXTRACTION: Extract all text sections of the macro block
    const macroEl = doc.querySelector(".macro");
    let macroHtml = "";
    let macroFullText = "";
    let macroTextLines: string[] = [];
    if (macroEl) {
      macroHtml = macroEl.innerHTML || "";
      macroFullText = macroEl.textContent || "";
      
      // Let's grab all elements under .macro that are either block elements or explicit content containers
      macroEl.querySelectorAll("h3, h4, p, li, .regime, .summary, .lede, .ke, .row2, .wcell, .ke-label, .ke-value, .ke-detail, .t, .e, .fp, .wd, .we, .status, .kev").forEach(el => {
        let text = "";
        if (el.classList.contains("ke") || el.classList.contains("kev")) {
          const when = el.querySelector("[class*='when']")?.textContent?.trim() || el.querySelector(".when")?.textContent?.trim() || "";
          const label = el.querySelector("[class*='label'], .kl")?.textContent?.trim() || el.querySelector(".kl")?.textContent?.trim() || "";
          const value = el.querySelector("[class*='value'], .kv")?.textContent?.trim() || el.querySelector(".kv")?.textContent?.trim() || "";
          const detail = el.querySelector("[class*='detail'], .kd")?.textContent?.trim() || el.querySelector(".kd")?.textContent?.trim() || "";
          text = `📅 EVENT: [${when}] ${label} (${value}) - ${detail}`;
        } else if (el.classList.contains("row2")) {
          const t = el.querySelector(".t")?.textContent?.trim() || "";
          const e = el.querySelector(".e")?.textContent?.trim() || "";
          const fp = el.querySelector(".fp")?.textContent?.trim() || "";
          text = `🕒 CALENDAR: ${t} | ${e} (${fp})`;
        } else if (el.classList.contains("wcell")) {
          const wd = el.querySelector(".wd")?.textContent?.trim() || "";
          const we = el.querySelector(".we")?.textContent?.trim() || "";
          const status = el.querySelector(".status")?.textContent?.trim() || "";
          text = `📆 WEEKLY: ${wd} - ${we} [${status}]`;
        } else {
          // If it's a leaf node or small container with text
          if (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild?.tagName.toLowerCase() === 'b')) {
            text = el.textContent?.trim() || "";
          } else if (el.classList.contains("summary") || el.classList.contains("regime") || el.classList.contains("lede")) {
            text = el.textContent?.trim() || "";
          }
        }

        if (text && text.length > 3) {
          const cleanedText = text.replace(/\s+/g, " ");
          if (cleanedText && !macroTextLines.includes(cleanedText)) {
            macroTextLines.push(cleanedText);
          }
        }
      });
    }

    // Scoreboard ticker rankings inside tables
    const scoreTables: any[] = [];
    doc.querySelectorAll("table").forEach((table) => {
      if (table.closest(".insiders")) return; // Skip nested insider tables in generic processor
      const headers: string[] = [];
      table.querySelectorAll("th").forEach(th => headers.push(th.textContent?.trim() || ""));
      
      const rows: any[] = [];
      table.querySelectorAll("tr").forEach((tr) => {
        if (tr.querySelector("th")) return; // skip header row
        const cells: any[] = [];
        tr.querySelectorAll("td").forEach(td => {
          // Capture inner styles & colorized tags
          const text = td.textContent?.trim() || "";
          const sparkles: any[] = [];
          td.querySelectorAll(".cell, .tk").forEach(c => {
            sparkles.push({
              text: c.textContent?.trim() || "",
              className: c.className
            });
          });
          cells.push({ text, sparkles });
        });
        if (cells.length > 0) rows.push({ cells });
      });

      // Find preceding sibling header or label
      let prevSibling = table.previousElementSibling;
      let label = "Metrics Panel";
      while (prevSibling) {
        if (prevSibling.tagName.toLowerCase().startsWith("h") || prevSibling.classList.contains("header") || prevSibling.textContent?.trim()) {
          label = prevSibling.textContent?.trim() || "Metrics Panel";
          break;
        }
        prevSibling = prevSibling.previousElementSibling;
      }

      scoreTables.push({
        title: label,
        headers,
        rows
      });
    });

    // Parse bottomLineData (🏆 Bottom Line — Who Wins Today)
    const leaderElement = doc.querySelector(".leader");
    let bottomLineData: any = null;
    if (leaderElement) {
      const winBox = leaderElement.querySelector(".lbox.win, .lbox:first-of-type");
      const loseBox = leaderElement.querySelector(".lbox.lose, .lbox:last-of-type");
      
      const parsedWinners: any[] = [];
      if (winBox) {
        winBox.querySelectorAll("li").forEach(li => {
          parsedWinners.push({
            text: li.textContent?.trim() || "",
            html: li.innerHTML,
            medal: li.querySelector(".medal")?.textContent?.trim() || ""
          });
        });
      }

      const parsedLosers: any[] = [];
      if (loseBox) {
        loseBox.querySelectorAll("li").forEach(li => {
          parsedLosers.push({
            text: li.textContent?.trim() || "",
            html: li.innerHTML,
            medal: li.querySelector(".medal")?.textContent?.trim() || ""
          });
        });
      }

      bottomLineData = {
        title: "🏆 Bottom Line — Who Wins Today",
        winners: parsedWinners,
        losers: parsedLosers
      };
    }

    // Parse actionSummaryData (🎯 Action Summary)
    const actionElement = doc.querySelector(".action");
    let actionSummaryData: any = null;
    if (actionElement) {
      const cols: any[] = [];
      actionElement.querySelectorAll(".col").forEach(col => {
        const title = col.querySelector("h4")?.textContent?.trim() || "Signal";
        const isWin = col.classList.contains("win") || title.toLowerCase().includes("buy") || title.toLowerCase().includes("winner");
        const isLose = col.classList.contains("lose") || title.toLowerCase().includes("sell") || title.toLowerCase().includes("loser") || title.toLowerCase().includes("hedge");
        
        const items: string[] = [];
        col.querySelectorAll("li").forEach(li => {
          items.push(li.textContent?.trim() || "");
        });

        cols.push({
          title,
          isWin,
          isLose,
          items
        });
      });

      actionSummaryData = {
        title: "🎯 Action Summary",
        cols
      };
    }

    // Parse insidersData (🟢 Insider Cluster Buys)
    const insidersElement = doc.querySelector(".insiders");
    let insidersData: any = null;
    if (insidersElement) {
      const title = insidersElement.querySelector(".ib-title")?.textContent?.trim() || "🟢 Insider Cluster Buys";
      const sub = insidersElement.querySelector(".ib-sub")?.textContent?.trim() || "";
      const note = insidersElement.querySelector(".ib-note")?.textContent?.trim() || "";
      const foot = insidersElement.querySelector(".ib-foot")?.textContent?.trim() || "";
      
      const stats: string[] = [];
      insidersElement.querySelectorAll(".ib-stat").forEach(el => {
        stats.push(el.textContent?.trim() || "");
      });

      const tables: any[] = [];
      insidersElement.querySelectorAll("table").forEach(table => {
        const headers: string[] = [];
        table.querySelectorAll("th").forEach(th => headers.push(th.textContent?.trim() || ""));

        const rows: any[] = [];
        table.querySelectorAll("tr").forEach(tr => {
          if (tr.querySelector("th")) return;
          const cells: any[] = [];
          tr.querySelectorAll("td").forEach(td => {
            const sparkles: any[] = [];
            td.querySelectorAll(".cell, .tk").forEach(c => {
              sparkles.push({
                text: c.textContent?.trim() || "",
                className: c.className
              });
            });
            cells.push({
              text: td.textContent?.trim() || "",
              links: Array.from(td.querySelectorAll("a")).map((a: any) => ({ text: a.textContent?.trim() || "", href: a.getAttribute("href") || "" })),
              sparkles,
              isCenter: td.getAttribute("align") === "center" || td.classList.contains("center"),
              isRight: td.getAttribute("align") === "right" || td.classList.contains("right"),
              isBold: td.tagName === "B" || !!td.querySelector("b") || td.classList.contains("bold")
            });
          });
          if (cells.length > 0) rows.push({ cells });
        });

        tables.push({
          title: table.previousElementSibling?.textContent?.trim() || "",
          headers,
          rows
        });
      });

      insidersData = {
        title,
        sub,
        note,
        foot,
        stats,
        tables
      };
    }

    return {
      isScoreboard,
      title,
      sub,
      reportTimestamp,
      generatedUtc,
      moodItems,
      winners,
      losers,
      newsItems,
      macroRegime,
      macroLede,
      macroEvents,
      macroHtml,
      macroFullText,
      macroTextLines,
      scoreTables,
      bottomLineData,
      actionSummaryData,
      insidersData
    };
  } catch (err) {
    console.error("parseReportData error:", err);
    return null;
  }
}

/**
 * Compiles report data into a fully-styled, high-fidelity responsive HTML document
 * that is compatible both with DOM Parser and raw iframe rendering.
 */
export function generateHTMLReportString(report: any): string {
  const title = report.title || "DAILY MARKET ACTION & TACTICAL MACRO HARVEST";
  const dateStr = report.reportDate || new Date().toISOString().split('T')[0];
  const timestampStr = report.reportTimestamp || `${dateStr} · 04:00pm ET (Staged Compile)`;
  const generatedUtc = report.generatedUtc || new Date().toISOString();
  const sub = report.sub || `Tactical Global Macro Briefing – Chronology Reporting Core`;

  // Process market indicator cells
  const defaultMarkets = [
    { ticker: "SPX", name: "S&P 500 Index", price: "5,431.25", change: "+0.44%", isPositive: true },
    { ticker: "NDX", name: "Nasdaq 150 Tracker", price: "19,650.10", change: "+0.81%", isPositive: true },
    { ticker: "VIX", name: "CBOE VIX Volatility", price: "12.85", change: "-3.20%", isPositive: false },
    { ticker: "US10Y", name: "US 10-Yr Treasury", price: "4.225%", change: "-1.24%", isPositive: false },
    { ticker: "CL1", name: "Crude WTI Spot", price: "$78.45", change: "-0.85%", isPositive: false },
    { ticker: "XAU", name: "Gold Spot $/oz", price: "$2,315.40", change: "+1.10%", isPositive: true }
  ];
  
  const markets = (report.marketData && report.marketData.length > 0) ? report.marketData : defaultMarkets;
  const moodHtml = markets.map((m: any) => {
    const changeStr = m.change !== undefined && m.change !== null ? String(m.change) : '';
    const isPos = m.isPositive || changeStr.includes('+');
    const isNeg = changeStr.includes('-');
    const cls = isPos ? "pos" : (isNeg ? "neg" : "neu");
    const deltaSign = isPos && changeStr && !changeStr.startsWith('+') ? "+" : "";
    return `
      <div class="cell">
        <span class="k">${m.ticker}</span>
        <span class="v">${m.price}</span>
        <span class="d ${cls}">${deltaSign}${changeStr}</span>
      </div>
    `;
  }).join('');

  // Process macro events
  const defaultEvents = [
    { when: "08:30am ET", kl: "U.S. Consumer Price Index (CPI MoM)", kv: "Previous: +0.2%", kd: "Expected: +0.1% | Act: +0.0% (Dovish Rebound Cluster)" },
    { when: "14:00pm ET", kl: "Federal Reserve FOMC Policy Decision", kv: "Range: 5.25%-5.50%", kd: "Status: Unchanged (Hawkish Projection Dot Plot Shift)" }
  ];
  const events = (report.macroEvents && report.macroEvents.length > 0) ? report.macroEvents : defaultEvents;
  const eventsHtml = events.map((ev: any) => {
    let cls = "neu";
    if (ev.className) {
      cls = ev.className;
    } else if (ev.kd?.toLowerCase().includes("dovish") || ev.kd?.toLowerCase().includes("win") || ev.kd?.toLowerCase().includes("beat")) {
      cls = "pos";
    } else if (ev.kd?.toLowerCase().includes("hawkish") || ev.kd?.toLowerCase().includes("miss") || ev.kd?.toLowerCase().includes("drop")) {
      cls = "neg";
    }
    return `
      <div class="ke ${cls}">
        <span class="when">${ev.when || '—'}</span>
        <div class="kl">${ev.kl || 'Macro Data Release'}</div>
        <div class="kv">${ev.kv || '—'}</div>
        <div class="kd">${ev.kd || ''}</div>
      </div>
    `;
  }).join('');

  // Extract winners and losers list
  const winnersList: string[] = [];
  const losersList: string[] = [];
  if (report.insiderTables && report.insiderTables.length > 0) {
    report.insiderTables.forEach((it: any) => {
      if (it.type === "Buy") {
        winnersList.push(`🟢 Buy group identified in ${it.ticker} (Price: $${it.price}, Shares: ${it.shares.toLocaleString()})`);
      } else {
        losersList.push(`🔴 Strategic selling in ${it.ticker} (Price: $${it.price})`);
      }
    });
  }
  
  if (report.newsDetailedAnalyses && report.newsDetailedAnalyses.length > 0) {
    report.newsDetailedAnalyses.forEach((nw: any) => {
      if (nw.beneficiaryTickers && nw.beneficiaryTickers.length > 0) {
        winnersList.push(`🟢 ${nw.beneficiaryTickers[0].ticker} : Beneficial catalyst thesis`);
      }
      if (nw.detrimentalTickers && nw.detrimentalTickers.length > 0) {
        losersList.push(`🔴 ${nw.detrimentalTickers[0].ticker} : Exposure headwinds or valuation stress`);
      }
    });
  }

  // Deduplicate and fallback
  const uniqueWinners = Array.from(new Set(winnersList)).slice(0, 5);
  const uniqueLosers = Array.from(new Set(losersList)).slice(0, 5);
  if (uniqueWinners.length === 0) {
    uniqueWinners.push("🟢 Sovereign yields compression benefits High-Beta Growth & Tech sector", "🟢 Capital rotations rotating long into industrial cyclical monopolies");
  }
  if (uniqueLosers.length === 0) {
    uniqueLosers.push("🔴 Elevated cost of capital squeeze regional mid-sized lenders", "🔴 Highly leveraged consumer discretionary retail stocks face headwinds");
  }

  // Compile detailed news columns
  const newsList = report.newsDetailedAnalyses || [];
  const newsHtml = newsList.map((nw: any, idx: number) => {
    const bens = nw.beneficiaryTickers || [];
    const dets = nw.detrimentalTickers || [];
    const tickerClassesHtml = [
      ...bens.map((b: any) => `<span class="tk p3">${b.ticker}</span>`),
      ...dets.map((d: any) => `<span class="tk n3">${d.ticker}</span>`)
    ].join(' ');

    return `
      <article class="news">
        <div class="top">
          <div>
            <h3><span class="sdot bull">🟢</span>${idx + 1} · ${nw.title}</h3>
            <div class="meta">Analysis Core Matrix • Staged Synthesis Delivery</div>
          </div>
          <div>
            <span class="pill prio">PRIORITY LEVEL ${9 - nw.priority || 7}</span>
            <span class="pill cat">Global Macro</span>
            <span class="pill conf hi">Confidence: HIGH</span>
          </div>
        </div>
        <div class="tickers-list">${tickerClassesHtml}</div>
        <div class="levels">
          <div class="level">
            <div class="lh">Implication Line</div>
            <div class="lc">${nw.implicationLine || 'No key implication provided'}</div>
          </div>
          <div class="level">
            <div class="lh">Level 1 · Direct Consequence</div>
            <div class="lc">${nw.level1Implication || 'No direct order details provided'}</div>
          </div>
          <div class="level">
            <div class="lh">Level 2 · Systemic Repercussions</div>
            <div class="lc">${nw.level2Implication || 'No systemic second order effects logged'}</div>
          </div>
        </div>
        <div class="two">
          <div class="col win">
            <h4>✅ Narrative Beneficiaries</h4>
            <ul>
              ${bens.map((b: any) => `<li><b>${b.ticker} (${b.name || b.ticker})</b>: ${b.rationale || 'Favorable cash-flow and capital structures.'}</li>`).join('')}
            </ul>
          </div>
          <div class="col lose">
            <h4>❌ Narrative Detrimentals/Victims</h4>
            <ul>
              ${dets.map((d: any) => `<li><b>${d.ticker} (${d.name || d.ticker})</b>: ${d.rationale || 'Friction or supply-chain margins compression.'}</li>`).join('')}
            </ul>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Compile action summary
  const defaultAction = {
    title: "🎯 Action Summary Map Matrix",
    cols: [
      { title: "Primary Long Vectors", items: ["Long cash rotation, options hedges"] },
      { title: "Primary Short Vectors", items: ["Selective high beta stock shorts"] }
    ]
  };
  const action = report.actionSummary || defaultAction;
  const actionColsHtml = (action.cols || []).map((col: any) => {
    const isWin = col.isWin || col.title.toLowerCase().includes("long") || col.title.toLowerCase().includes("win");
    const isLose = col.isLose || col.title.toLowerCase().includes("short") || col.title.toLowerCase().includes("lose");
    const colCls = isWin ? "win" : (isLose ? "lose" : "neu");
    return `
      <div class="col ${colCls}">
        <h4>${col.title}</h4>
        <ul>
          ${(col.items || []).map((it: string) => `<li>${it}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');

  // Compile Insider table
  const insiderStatsList = report.insiderStats && report.insiderStats.length > 0
    ? report.insiderStats
    : ["Aggregated strategic buy-to-sell ratio is highly resilient at 3.1:1.", "Volume clustering in major industrial defense and energy sectors."];
  const insiderTables = report.insiderTables || [];
  
  const insiderTablesHtml = insiderTables.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Insider Entity</th>
          <th>Relationship / Role</th>
          <th align="center">Price ($)</th>
          <th align="right">Shares</th>
          <th align="right">Value ($)</th>
          <th align="center">Type</th>
        </tr>
      </thead>
      <tbody>
        ${insiderTables.map((row: any) => `
          <tr>
            <td><b class="tk">${row.ticker}</b></td>
            <td>${row.insider}</td>
            <td>${row.relationship || "Director"}</td>
            <td align="center">${row.price ? `$${row.price}` : '—'}</td>
            <td align="right">${row.shares ? row.shares.toLocaleString() : '—'}</td>
            <td align="right">${row.value ? `$${row.value.toLocaleString()}` : (row.price && row.shares ? `$${(row.price * row.shares).toLocaleString()}` : '—')}</td>
            <td align="center"><span class="badge ${row.type === "Buy" ? "pos" : "neg"}">${row.type}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : `<p class="italic" style="color:var(--muted);font-size:12px;margin-top:10px;">No structured corporate insider transactions to display currently.</p>`;

  // Construct complete stylized output
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} (${dateStr})</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #121935;
      --ink: #e8ecf8;
      --muted: #9aa3c7;
      --line: #243056;
      --green: #16c784;
      --green2: #0d8c5d;
      --red: #ea3943;
      --red2: #a51e26;
      --yellow: #f5b21a;
      --blue: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      background-color: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      background: var(--bg);
    }
    .hero {
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 24px;
      border-radius: 24px;
      margin-bottom: 24px;
      text-align: left;
    }
    .hero h1 {
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 4px 0;
      letter-spacing: -0.5px;
    }
    .hero .sub {
      color: var(--yellow);
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .hero .stamp {
      font-size: 11px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      padding-top: 12px;
      margin-top: 12px;
    }
    .hero .stamp b { color: var(--yellow); }
    .mood {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .mood .cell {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .mood .cell .k { font-size: 11px; color: var(--muted); font-weight: bold; text-transform: uppercase; }
    .mood .cell .v { font-size: 18px; font-weight: 800; color: #fff; margin: 4px 0; }
    .mood .cell .d { font-size: 12px; font-weight: 700; }
    .mood .cell .d.pos { color: var(--green); }
    .mood .cell .d.neg { color: var(--red); }
    .mood .cell .d.neu { color: var(--muted); }
    
    .macro {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 24px;
      text-align: left;
    }
    .macro .ttl {
      color: var(--yellow);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: bold;
      letter-spacing: 1px;
      margin-bottom: 4px;
      display: block;
    }
    .macro .regime {
      font-size: 20px;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.5px;
      display: block;
    }
    .macro .lede {
      font-size: 14px;
      color: #fff;
      margin: 12px 0;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    .keyev {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }
    .ke {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.01);
      gap: 14px;
    }
    .ke .when {
      font-weight: bold;
      font-size: 11px;
      color: var(--yellow);
      white-space: nowrap;
      min-width: 80px;
      margin-top: 2px;
    }
    .ke .kl { font-weight: bold; font-size: 13px; color: #fff; flex: 1; }
    .ke .kv { font-size: 11px; color: var(--muted); white-space: nowrap; margin-top: 1px; padding: 0 10px;}
    .ke .kd { font-size: 11px; color: var(--muted); max-width: 400px; text-align: right; }
    .ke.pos { border-left: 3px solid var(--green); }
    .ke.neg { border-left: 3px solid var(--red); }
    .ke.neu { border-left: 3px solid var(--muted); }

    .action {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 24px;
      text-align: left;
    }
    .action h3 { color: #fff; font-size: 16px; font-weight: 950; margin: 0 0 14px 0; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .action-grid .col h4 { text-transform: uppercase; font-size: 12px; margin: 0 0 10px 0; font-weight: 800; }
    .action-grid .col.win h4 { color: var(--green); }
    .action-grid .col.lose h4 { color: var(--red); }
    .action-grid .col ul, .two .col ul { padding-left: 20px; margin: 0; font-size: 12px; color: var(--muted); }
    .action-grid .col li, .two .col li { margin-bottom: 6px; }

    .insiders {
      background: #112c24; /* Green themed board */
      border: 1px solid var(--green2);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 24px;
      text-align: left;
    }
    .insiders .ib-title { color: #fff; font-size: 16px; font-weight: 900; margin: 0 0 4px 0; }
    .insiders .ib-sub { color: var(--green); font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 12px; }
    .insiders .ib-stat { color: #e8ecf8; font-size: 12px; border-left: 2px solid var(--green); padding-left: 10px; margin-bottom: 12px; }
    .insiders table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
    .insiders th { text-align: left; padding: 8px; color: var(--green); border-bottom: 1px solid var(--green2); font-size: 10px; text-transform: uppercase; }
    .insiders td { padding: 8px; border-bottom: 1px solid rgba(13,140,93,0.2); color: #fff; }
    .insiders td b.tk { background: rgba(22,199,132,0.15); border: 1px solid var(--green); padding: 2px 6px; border-radius: 4px; font-size: 11px; }

    .leader {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
      text-align: left;
    }
    .leader .lbox { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; padding: 20px; }
    .leader .lbox.win h3 { color: var(--green); font-size: 14px; margin: 0 0 10px 0; border-bottom: 1px solid var(--line); padding-bottom: 8px; text-transform: uppercase; }
    .leader .lbox.lose h3 { color: var(--red); font-size: 14px; margin: 0 0 10px 0; border-bottom: 1px solid var(--line); padding-bottom: 8px; text-transform: uppercase; }
    .leader ul { padding-left: 18px; margin: 0; font-size: 12px; color: var(--muted); }
    .leader li { margin-bottom: 6px; }

    .news {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 20px;
      text-align: left;
    }
    .news .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .news h3 { font-size: 15px; font-weight: 800; color: #fff; margin: 0 0 4px 0; }
    .news h3 .sdot { font-size: 11px; margin-right: 6px; vertical-align: middle; }
    .news .meta { font-size: 11px; color: var(--muted); }
    .pill {
      font-size: 10px;
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      border: 1px solid var(--line);
      color: #fff;
    }
    .pill.prio { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: var(--blue); }
    .pill.cat { background: rgba(245,178,26,0.1); border-color: rgba(245,178,26,0.25); color: var(--yellow); }
    .pill.conf { background: rgba(22,199,132,0.1); border-color: rgba(22,199,132,0.25); color: var(--green); }
    .news .tickers-list { margin: 8px 0; }
    .tk {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 6px;
      border-radius: 4px;
      margin-right: 4px;
      border: 1px solid;
    }
    .tk.p3 { background: rgba(22,199,132,0.1); border-color: var(--green); color: var(--green); }
    .tk.n3 { background: rgba(234,57,67,0.1); border-color: var(--red); color: var(--red); }
    .levels { margin: 14px 0; }
    .level { margin-bottom: 8px; border-bottom: 1px solid rgba(36,48,86,0.4); padding-bottom: 6px; }
    .level .lh { font-size: 10px; text-transform: uppercase; color: var(--muted); font-weight: bold; }
    .level .lc { font-size: 12px; color: #fff; font-weight: bold; margin-top: 2px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }
    .two .col h4 { text-transform: uppercase; font-size: 11px; font-weight: 800; margin: 0 0 10px 0; }
    .two .col.win h4 { color: var(--green); }
    .two .col.lose h4 { color: var(--red); }
    .badge { border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase; padding: 2px 6px; }
    .badge.pos { background: var(--green2); color: #fff; }
    .badge.neg { background: var(--red2); color: #fff; }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Header Block -->
    <header class="hero">
      <h1>${title}</h1>
      <div class="sub">${sub}</div>
      <div class="stamp">
        🕐 Report timestamp: <b>${timestampStr}</b>
        &nbsp;&nbsp;<span style="opacity:0.65">(generated ${generatedUtc})</span>
      </div>
    </header>

    <!-- Indicators Block -->
    <section class="mood">
      ${moodHtml}
    </section>

    <!-- Macro Regime Overview Block -->
    <section class="macro">
      <span class="ttl">🏛️ Macro regime assessment</span>
      <span class="regime">${report.macroRegime || 'UNCLASSIFIED ASSESSMENT'}</span>
      <div class="lede">
        <b>${report.macroLede || 'No narrative lede text available.'}</b>
      </div>
      
      <div class="keyev">
        ${eventsHtml}
      </div>
    </section>

    <!-- Tactical Action Matrix -->
    <section class="action">
      <h3>🎯 Action Plan Matrix Matrix</h3>
      <div class="action-grid">
        ${actionColsHtml}
      </div>
    </section>

    <!-- Green Insider Board -->
    <section class="insiders">
      <div class="ib-title">🟢 Insider Cluster Transactions</div>
      <div class="ib-sub">Strategic corporate insider transactions summary</div>
      ${insiderStatsList.map((st: string) => `<div class="ib-stat">${st}</div>`).join('')}
      ${insiderTablesHtml}
    </section>

    <!-- Bottom Line Leaderboard -->
    <section class="leader">
      <div class="lbox win">
        <h3>🏆 Top Beneficiary Vectors</h3>
        <ul>
          ${uniqueWinners.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
      <div class="lbox lose">
        <h3>⚠️ Critical Risk/Short Vectors</h3>
        <ul>
          ${uniqueLosers.map(l => `<li>${l}</li>`).join('')}
        </ul>
      </div>
    </section>

    <!-- News Articles detailed cards -->
    <section>
      ${newsHtml}
    </section>
  </div>
</body>
</html>
`;
}

