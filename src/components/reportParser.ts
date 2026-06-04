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
