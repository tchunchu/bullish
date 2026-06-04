import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Newspaper, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2, 
  Sparkles, 
  Upload, 
  Check, 
  Trash2, 
  Calendar, 
  ArrowUpRight, 
  Lock, 
  MessageSquare, 
  Send, 
  Layers, 
  Cpu,
  RefreshCw,
  ArrowLeft,
  BookOpen,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ai, MODELS } from '../lib/gemini';
import { UploadedHtmlReport, DailyNewsLog } from '../types';
import { BeautifulNewsReader } from './BeautifulNewsReader';

function cn(...classes: any[]) {
  return classes.filter(Boolean).filter(Boolean).join(' ');
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

// Strip HTML tags to create lightweight text summaries for context ingestion
function extractPlainTextFromHtml(html: string): string {
  let clean = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, "");
  
  // Custom tag spacer logic
  clean = clean.replace(/<\/div>/gi, "\n");
  clean = clean.replace(/<\/h[1-6]>/gi, "\n\n");
  clean = clean.replace(/<\/p>/gi, "\n\n");
  clean = clean.replace(/<\/tr>/gi, "\n");
  clean = clean.replace(/<\/li>/gi, "\n - ");
  clean = clean.replace(/<[^>]+>/g, " ");
  
  // Decoding basic entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&bull;/g, "•");
    
  clean = clean.replace(/[ \t]+/g, " ");
  clean = clean.replace(/\n\s*\n+/g, "\n\n");
  return clean.trim();
}

// Dynamic client-side parser to translate offline high-fidelity HTML templates to native responsive objects
function parseReportData(html: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Determine if it is scoreboard or daily news
    const isScoreboard = html.includes("Cumulative Ticker Scoreboard") || (doc.querySelector("h1")?.textContent || "").includes("Scoreboard");

    const title = doc.querySelector("h1")?.textContent || "Market Beat Report";
    const sub = doc.querySelector(".sub")?.textContent || "";

    // Parse timestamp and generatedUtc
    const stampEl = doc.querySelector(".stamp") || doc.querySelector(".hero .stamp");
    let reportTimestamp = "";
    let generatedUtc = "";
    if (stampEl) {
      reportTimestamp = stampEl.querySelector("b")?.textContent?.trim() || "";
      const spanText = stampEl.querySelector("span")?.textContent || "";
      const genMatch = spanText.match(/generated\s+([0-9a-zA-Z-.:_Z]+)/i);
      if (genMatch && genMatch[1]) {
        generatedUtc = genMatch[1].trim();
      }
    }
    if (!reportTimestamp) {
      const stampMatch = html.match(/Report timestamp:\s*<b>([\s\S]*?)<\/b>/i);
      if (stampMatch && stampMatch[1]) {
        reportTimestamp = stampMatch[1].trim();
      }
    }
    if (!generatedUtc) {
      const genMatch = html.match(/\(generated\s+([0-9a-zA-Z.:T_-]+)\)/i);
      if (genMatch && genMatch[1]) {
        generatedUtc = genMatch[1].trim();
      }
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

    // Macro calendar items
    const macroRegime = doc.querySelector(".macro .regime")?.textContent?.trim() || "";
    const macroLede = doc.querySelector(".macro .lede")?.textContent?.trim() || "";
    const macroEvents: any[] = [];
    doc.querySelectorAll(".macro .kev").forEach(el => {
      macroEvents.push({
        when: el.querySelector(".when")?.textContent?.trim() || "",
        kl: el.querySelector(".kl")?.textContent?.trim() || "",
        kv: el.querySelector(".kv")?.textContent?.trim() || "",
        kd: el.querySelector(".kd")?.textContent?.trim() || "",
        className: el.className
      });
    });

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
        if (cells.length > 0) rows.push(cells);
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
        table.querySelectorAll("tbody tr, tr").forEach(tr => {
          if (tr.querySelector("th")) return; // skip header tr
          const cells: any[] = [];
          tr.querySelectorAll("td").forEach(td => {
            const isBold = td.querySelector("b") !== null;
            const textContent = td.textContent?.trim() || "";
            const isCenter = td.getAttribute("style")?.includes("center") || false;
            const isRight = td.getAttribute("style")?.includes("right") || false;
            
            const links: any[] = [];
            td.querySelectorAll("a").forEach(a => {
              links.push({
                href: a.getAttribute("href") || "#",
                text: a.textContent?.trim() || "Link",
                isVerify: true
              });
            });

            const buyerSpan = td.querySelector(".ib-buyers");
            const buyerCount = buyerSpan ? buyerSpan.textContent?.trim() : null;

            cells.push({
              text: textContent,
              isBold,
              isCenter,
              isRight,
              buyerCount,
              links
            });
          });
          if (cells.length > 0) rows.push({ cells });
        });

        tables.push({
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
      moodItems,
      winners,
      losers,
      newsItems,
      macroRegime,
      macroLede,
      macroEvents,
      scoreTables,
      bottomLineData,
      actionSummaryData,
      insidersData,
      reportTimestamp,
      generatedUtc
    };
  } catch (err) {
    console.error("DOMParser error:", err);
    return null;
  }
}

export function MarketNews() {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [uploadedReports, setUploadedReports] = useState<UploadedHtmlReport[]>([]);
  const [activePreviewReport, setActivePreviewReport] = useState<UploadedHtmlReport | null>(null);
  const [viewMode, setViewMode] = useState<'iframe' | 'reader'>('reader'); // Default to reader for stylized mobile view!

  // Daily News Extraction Tracking Logs
  const [dailyNewsLogs, setDailyNewsLogs] = useState<DailyNewsLog[]>([]);
  const [activeLogView, setActiveLogView] = useState<DailyNewsLog | null>(null);
  const [localLogs, setLocalLogs] = useState<DailyNewsLog[]>([]);

  // Drag over states
  const [dragCurrentActive, setDragCurrentActive] = useState(false);
  const [dragStatusActive, setDragStatusActive] = useState(false);

  // Parsing & Action feedback
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local anonymous cache fallback
  const [localArchive, setLocalArchive] = useState<UploadedHtmlReport[]>([]);

  // Pending file upload representation
  const [pendingUpload, setPendingUpload] = useState<{
    reportType: "current" | "status";
    reportDate: string;
    title: string;
    htmlContent: string;
    plainText: string;
  } | null>(null);

  const [isImmersiveReaderOpen, setIsImmersiveReaderOpen] = useState(false);

  // Listen for user sign-in state shifts
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Safe manual local fallback reader
  const loadLocalReports = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('local_html_report_') || k === 'local_latest_daily_report');
    const items: UploadedHtmlReport[] = [];
    keys.forEach(k => {
      try {
        const item = JSON.parse(localStorage.getItem(k) || '');
        if (item) items.push(item);
      } catch (err) {
        console.warn("Could not read local report item:", k, err);
      }
    });
    // Sort descending by date
    items.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    setLocalArchive(items);
  };

  // Safe manual local logs loader
  const loadLocalLogs = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('local_daily_news_log_'));
    const items: DailyNewsLog[] = [];
    keys.forEach(k => {
      try {
        const item = JSON.parse(localStorage.getItem(k) || '');
        if (item) items.push(item);
      } catch (err) {
        console.warn("Could not read local log item:", k, err);
      }
    });
    items.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    setLocalLogs(items);
  };

  // Safe active remote query stream from Firestore
  useEffect(() => {
    if (!currentUser) {
      loadLocalReports();
      loadLocalLogs();
      return;
    }

    // A. Stream the uploaded reports (Latest only)
    const reportsRef = collection(db, "uploaded_html_reports");
    const qReports = query(
      reportsRef,
      where("userId", "==", currentUser.uid)
    );

    const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
      const list: UploadedHtmlReport[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UploadedHtmlReport);
      });
      setUploadedReports(list);

      // Default active preview to latest if not set
      if (list.length > 0 && !activePreviewReport) {
        // Sort descending by date just to be seguro
        const sortedList = [...list].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
        setActivePreviewReport(sortedList[0]);
      }
    }, (err) => {
      console.error("onSnapshot reports error:", err);
      handleFirestoreError(err, OperationType.LIST, "uploaded_html_reports");
    });

    // B. Stream the daily tracking logs
    const logsRef = collection(db, "daily_news_logs");
    const qLogs = query(
      logsRef,
      where("userId", "==", currentUser.uid)
    );

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const list: DailyNewsLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DailyNewsLog);
      });
      list.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      setDailyNewsLogs(list);
    }, (err) => {
      console.error("onSnapshot logs error:", err);
      handleFirestoreError(err, OperationType.LIST, "daily_news_logs");
    });

    return () => {
      unsubscribeReports();
      unsubscribeLogs();
    };
  }, [currentUser]);

  // Handle parsing after dropping or selecting file
  const parseHtmlReportFile = (file: File, type: "current" | "status") => {
    setIsFileLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setPendingUpload(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const html = e.target?.result as string;
        if (!html) throw new Error("File content is empty or unreadable.");

        // Clean extract date from title or stamp matching YYYY-MM-DD
        let extractedDate = "";
        
        // 1. Try matching inside the title first: e.g., "Market Beat ... 2026-06-03"
        const titleMatchCheck = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1>([\s\S]*?)<\/h1>/i);
        if (titleMatchCheck && titleMatchCheck[1]) {
          const tDateMatch = titleMatchCheck[1].match(/\b\d{4}-\d{2}-\d{2}\b/);
          if (tDateMatch) {
            extractedDate = tDateMatch[0];
          }
        }
        
        // 2. Try matching inside stamp b tag (the actual report timestamp value)
        if (!extractedDate) {
          const stampMatch = html.match(/Report timestamp:\s*<b>\s*(\d{4}-\d{2}-\d{2})/i) || html.match(/class="stamp"[^>]*>\s*🕐\s*Report\s*timestamp:\s*<b>\s*(\d{4}-\d{2}-\d{2})/i);
          if (stampMatch && stampMatch[1]) {
            extractedDate = stampMatch[1];
          }
        }

        // 3. Fallback to the first occurrence in the document
        if (!extractedDate) {
          const dateMatches = html.match(/\b\d{4}-\d{2}-\d{2}\b/g);
          if (dateMatches && dateMatches.length > 0) {
            extractedDate = dateMatches[0]; // Usually first mention is the report title/header date
          } else {
            extractedDate = new Date().toISOString().split("T")[0]; // default fallback
          }
        }

        // Clean extract title
        let extractedTitle = type === "current" ? "Market Beat — News Impact Analysis" : "Cumulative Ticker Scoreboard";
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          extractedTitle = titleMatch[1].trim()
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"');
        } else {
          const h1Match = html.match(/<h1>([\s\S]*?)<\/h1>/i);
          if (h1Match && h1Match[1]) {
            extractedTitle = h1Match[1].trim();
          }
        }

        const plainText = extractPlainTextFromHtml(html);

        setPendingUpload({
          reportType: type,
          reportDate: extractedDate,
          title: extractedTitle,
          htmlContent: html,
          plainText
        });

        setSuccessMsg(`Parsed successfully: "${extractedTitle}" representing Date [${extractedDate}]`);
      } catch (err: any) {
        setErrorMsg(`Failed to parse HTML structure: ${err.message}`);
      } finally {
        setIsFileLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // Write content to Firebase (with simple overwrite matching type and date)
  const savePendingToArchive = async () => {
    if (!pendingUpload) return;
    setIsFileLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const parsed = parseReportData(pendingUpload.htmlContent);

    if (!currentUser) {
      // Local storage fallback for convenience
      try {
        const localKey = `local_latest_${pendingUpload.reportType}_report`;
        const newLocalItem: UploadedHtmlReport = {
          id: `latest_${pendingUpload.reportType}_report`,
          userId: "anonymous",
          reportType: pendingUpload.reportType,
          reportDate: pendingUpload.reportDate,
          title: pendingUpload.title,
          htmlContent: pendingUpload.htmlContent,
          plainText: pendingUpload.plainText,
          reportTimestamp: parsed?.reportTimestamp || "",
          generatedUtc: parsed?.generatedUtc || "",
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(localKey, JSON.stringify(newLocalItem));

        // ALSO CREATE THE HISTORIC DAILY TRACK LOG ENTRY Offline
        let localLogSuffix = "";
        if (parsed?.generatedUtc) {
          localLogSuffix = "_" + parsed.generatedUtc.replace(/[^a-zA-Z0-9]/g, "");
        } else if (parsed?.reportTimestamp) {
          localLogSuffix = "_" + parsed.reportTimestamp.replace(/[^a-zA-Z0-9]/g, "");
        } else {
          localLogSuffix = "_" + Date.now();
        }
        const logLocalKey = `local_daily_news_log_${pendingUpload.reportDate}${localLogSuffix}`;
        const localLogPayload: DailyNewsLog = {
          id: logLocalKey,
          userId: "anonymous",
          reportDate: pendingUpload.reportDate,
          title: pendingUpload.title,
          macroRegime: parsed?.macroRegime || "",
          macroLede: parsed?.macroLede || "",
          macroEvents: parsed?.macroEvents || [],
          actionSummary: parsed?.actionSummaryData || null,
          insiderStats: parsed?.insidersData?.stats || [],
          insiderTables: parsed?.insidersData?.tables || [],
          reportTimestamp: parsed?.reportTimestamp || "",
          generatedUtc: parsed?.generatedUtc || "",
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(logLocalKey, JSON.stringify(localLogPayload));

        setSuccessMsg(`[Local Cache] Overwritten latest news report and appended daily highlights log for [${pendingUpload.reportDate}].`);
        setPendingUpload(null);
        loadLocalReports();
        loadLocalLogs();
        
        // Immediately set as active preview report
        setActivePreviewReport(newLocalItem);
      } catch (err: any) {
        setErrorMsg(`Local cache write failed: ${err.message}`);
      } finally {
        setIsFileLoading(false);
      }
      return;
    }

    try {
      // Overwrite ONLY the latest active html news analysis file of this reportType
      const docId = `${currentUser.uid}_latest_${pendingUpload.reportType}_report`;
      const reportRef = doc(db, "uploaded_html_reports", docId);

      const payload = {
        userId: currentUser.uid,
        reportType: pendingUpload.reportType,
        reportDate: pendingUpload.reportDate,
        title: pendingUpload.title,
        htmlContent: pendingUpload.htmlContent,
        plainText: pendingUpload.plainText,
        reportTimestamp: parsed?.reportTimestamp || "",
        generatedUtc: parsed?.generatedUtc || "",
        timestamp: serverTimestamp()
      };

      await setDoc(reportRef, payload);

      // ALSO SAVE TO THE DISTINCT HISTORIC NEWS LOGS WITH EXTRACTED SECTIONS
      // Suffix keyed on custom timestamp to support multiple entries on the same day without overwriting
      let logSuffix = "";
      if (parsed?.generatedUtc) {
        logSuffix = "_" + parsed.generatedUtc.replace(/[^a-zA-Z0-9]/g, "");
      } else if (parsed?.reportTimestamp) {
        logSuffix = "_" + parsed.reportTimestamp.replace(/[^a-zA-Z0-9]/g, "");
      } else {
        logSuffix = "_" + Date.now();
      }
      const logId = `${currentUser.uid}_${pendingUpload.reportDate}${logSuffix}`;
      const logRef = doc(db, "daily_news_logs", logId);
      const logPayload = {
        userId: currentUser.uid,
        reportDate: pendingUpload.reportDate,
        title: pendingUpload.title,
        macroRegime: parsed?.macroRegime || "",
        macroLede: parsed?.macroLede || "",
        macroEvents: parsed?.macroEvents || [],
        actionSummary: parsed?.actionSummaryData || null,
        insiderStats: parsed?.insidersData?.stats || [],
        insiderTables: parsed?.insidersData?.tables || [],
        reportTimestamp: parsed?.reportTimestamp || "",
        generatedUtc: parsed?.generatedUtc || "",
        timestamp: serverTimestamp()
      };

      await setDoc(logRef, logPayload);

      setSuccessMsg(`Report archived. Highlights auto-logged chronologically to Tracking Feed.`);
      
      // Immediately set as active preview report
      setActivePreviewReport({
        id: docId,
        ...payload
      });
      setPendingUpload(null);
    } catch (err: any) {
      setErrorMsg(`Firestore Write Refused: ${err.message}`);
      handleFirestoreError(err, OperationType.WRITE, "uploaded_html_reports");
    } finally {
      setIsFileLoading(false);
    }
  };

  // Remove report item from archive
  const handleDeleteReport = async (report: UploadedHtmlReport) => {
    if (!confirm(`Are you absolutely sure you want to delete "${report.title}" on date ${report.reportDate}?`)) return;
    
    setErrorMsg("");
    setSuccessMsg("");

    if (!currentUser) {
      try {
        const localKey = `local_latest_daily_report`;
        localStorage.removeItem(localKey);
        setSuccessMsg(`Deleted from local cache: ${report.title}`);
        loadLocalReports();
        if (activePreviewReport?.id === report.id) {
          setActivePreviewReport(null);
        }
      } catch (err: any) {
        setErrorMsg(`Failed local deletion: ${err.message}`);
      }
      return;
    }

    try {
      if (!report.id) return;
      const docRef = doc(db, "uploaded_html_reports", report.id);
      await deleteDoc(docRef);
      setSuccessMsg(`Successfully purged latest report: ${report.reportDate}`);
      if (activePreviewReport?.id === report.id) {
        setActivePreviewReport(null);
      }
    } catch (err: any) {
      setErrorMsg(`Deletion failed: ${err.message}`);
      handleFirestoreError(err, OperationType.DELETE, `uploaded_html_reports/${report.id}`);
    }
  };

  // Remove daily log item from archive tracking feed
  const handleDeleteDailyLog = async (log: DailyNewsLog) => {
    if (!confirm(`Are you absolutely sure you want to delete the daily log for date ${log.reportDate}?`)) return;

    setErrorMsg("");
    setSuccessMsg("");

    if (!currentUser) {
      try {
        if (log.id) {
          localStorage.removeItem(log.id);
          setSuccessMsg(`Deleted daily log for ${log.reportDate} from local cache.`);
          loadLocalLogs();
          if (activeLogView?.id === log.id) {
            setActiveLogView(null);
          }
        }
      } catch (err: any) {
        setErrorMsg(`Failed local deletion: ${err.message}`);
      }
      return;
    }

    try {
      if (!log.id) return;
      await deleteDoc(doc(db, "daily_news_logs", log.id));
      setSuccessMsg(`Successfully deleted daily log for ${log.reportDate}`);
      if (activeLogView?.id === log.id) {
        setActiveLogView(null);
      }
    } catch (err: any) {
      setErrorMsg(`Deletion failed: ${err.message}`);
      handleFirestoreError(err, OperationType.DELETE, `daily_news_logs/${log.id}`);
    }
  };

  // Support manual logging
  const handleLogHtmlReportToHistory = async (report: UploadedHtmlReport) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const parsed = parseReportData(report.htmlContent);
      if (!currentUser) {
        const logId = `local_daily_news_log_${report.reportDate}_${Date.now()}`;
        const logPayload: DailyNewsLog = {
          id: logId,
          userId: "anonymous",
          reportDate: report.reportDate,
          title: report.title,
          macroRegime: parsed?.macroRegime || "",
          macroLede: parsed?.macroLede || "",
          macroEvents: parsed?.macroEvents || [],
          actionSummary: parsed?.actionSummaryData || null,
          insiderStats: parsed?.insidersData?.stats || [],
          insiderTables: parsed?.insidersData?.tables || [],
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(logId, JSON.stringify(logPayload));
        setSuccessMsg(`Manually logged insights tracker for ${report.reportDate} locally.`);
        loadLocalLogs();
        return;
      }

      const logId = `${currentUser.uid}_${report.reportDate}_${Date.now()}`;
      const logRef = doc(db, "daily_news_logs", logId);
      const logPayload = {
        userId: currentUser.uid,
        reportDate: report.reportDate,
        title: report.title,
        macroRegime: parsed?.macroRegime || "",
        macroLede: parsed?.macroLede || "",
        macroEvents: parsed?.macroEvents || [],
        actionSummary: parsed?.actionSummaryData || null,
        insiderStats: parsed?.insidersData?.stats || [],
        insiderTables: parsed?.insidersData?.tables || [],
        timestamp: serverTimestamp()
      };
      await setDoc(logRef, logPayload);
      setSuccessMsg(`Manually logged insights tracker for ${report.reportDate} to Cloud Firestore.`);
    } catch (err: any) {
      setErrorMsg(`Manual logging failed: ${err.message}`);
    }
  };

  // Group reports by date, allowing convenient slots matching
  const activeReportsList = currentUser ? uploadedReports : localArchive;
  const datesSet = Array.from(new Set(activeReportsList.map(r => r.reportDate))).sort((a, b) => b.localeCompare(a));
  const groupedReports = datesSet.slice(0, 5).map(date => {
    const dailyItems = activeReportsList.filter(r => r.reportDate === date);
    return {
      date,
      current: dailyItems.find(r => r.reportType === "current"),
      status: dailyItems.find(r => r.reportType === "status")
    };
  });

  const siblingReport = activeReportsList.find(
    r => r.reportDate === activePreviewReport?.reportDate && r.reportType !== activePreviewReport?.reportType
  );

  const chatSectionRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const triggerInstantAiInquiry = async (customPrompt: string) => {
    if (typeof (window as any).triggerUniversalAiInquiry === 'function') {
      (window as any).triggerUniversalAiInquiry(customPrompt);
      return;
    }
  };

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // Custom style injection to make elements indicate they are interactive / clickable
      const style = iframeDoc.createElement('style');
      style.textContent = `
        p, li, td, th, h1, h2, h3, h4, h5, .cell, .tk, .sect {
          cursor: pointer !important;
          transition: all 0.15s ease !important;
        }
        p:hover, li:hover, td:hover, th:hover, h3:hover, h4:hover, h5:hover, .cell:hover, .tk:hover {
          background-color: rgba(139, 92, 246, 0.08) !important;
          outline: 1.5px dashed rgba(139, 92, 246, 0.4) !important;
          border-radius: 4px !important;
        }
      `;
      iframeDoc.head.appendChild(style);

      // Selection Listener inside iframe
      iframeDoc.addEventListener("mouseup", () => {
        const selection = iframeDoc.getSelection();
        const selectedText = selection?.toString().trim();
        if (selectedText && selectedText.length > 5 && selectedText.length < 500) {
          triggerInstantAiInquiry(`Analyze and explain this selected reference from the report: "${selectedText}"`);
        }
      });

      // Click Listener inside iframe
      iframeDoc.addEventListener("click", (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        
        // If text was selected, let selection handle it instead
        if (iframeDoc.getSelection()?.toString().trim()) return;

        const text = target.textContent?.trim() || "";
        
        // Filter out generic boilerplate, too short or too long strings
        if (text.length > 8 && text.length < 400) {
          const reportDate = activePreviewReport ? activePreviewReport.reportDate : "active date";
          const reportType = activePreviewReport ? (activePreviewReport.reportType === "current" ? "Daily News" : "Scoreboard") : "report";
          triggerInstantAiInquiry(`Analyze this specific detail from the ${reportType} report dated ${reportDate}: "${text}"`);
        }
      });
    } catch (err) {
      console.warn("Iframe same-origin styling block bypassed:", err);
    }
  };



  return (
    <div className="bg-[#0b1020] text-[#e8ecf8] p-6 rounded-3xl border border-[#243056] shadow-2xl flex flex-col space-y-6 h-full overflow-y-auto">
      
      {/* Dynamic Header */}
      <header className="bg-gradient-to-br from-[#1a2454] to-[#0b1020] border border-[#243056] rounded-2xl p-5 shadow-inner">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="bg-[#243056] text-[#cfd8ff] text-[10px] font-extrabold uppercase px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
            <Newspaper className="w-3.5 h-[#f5b21a]-4 text-amber-400" />
            HTML REPORTS HARVESTER & ARCHIVE
          </span>
          <span className="bg-[#1f2a55] text-[#cfd8ff] text-[10px] uppercase px-3 py-1 rounded-full font-semibold">
            SECURE PERSONAL ARCHIVE
          </span>
          <span className="bg-emerald-900/40 text-emerald-300 border border-emerald-500/20 text-[10px] px-3 py-1 rounded-full font-bold">
            Zero Rate-Limit Interruption Mode
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black font-display text-white tracking-tight leading-none mb-1.5">
              High-Fidelity Reports Studio & Portfolio Trends
            </h1>
            <p className="text-xs text-[#9aa3c7] font-medium">
              Optionally upload pre-generated news impact analyses and scoreboard snapshots. Standalone overwrites match by Date to easily isolate trends.
            </p>
          </div>
          {!currentUser && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl font-mono">
              <Lock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Offline Cache Active. Sign in to sync with cloud.</span>
            </div>
          )}
        </div>
      </header>

      {/* Notifications Area */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-white uppercase font-bold text-[10px]">Dismiss</button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-xs font-medium animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="text-red-400 hover:text-white uppercase font-bold text-[10px]">Dismiss</button>
        </div>
      )}

      {/* Uploading workspace bento block */}
      <section className="col-span-full">
        
        {/* Dropzone A: Daily News analysis */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setDragCurrentActive(true); }}
          onDragLeave={() => setDragCurrentActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragCurrentActive(false);
            if (e.dataTransfer.files?.length > 0) parseHtmlReportFile(e.dataTransfer.files[0], "current");
          }}
          className={`border-2 border-dashed rounded-2xl p-7 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative ${
            dragCurrentActive 
              ? "border-[#16c784] bg-emerald-500/5 shadow-[0_0_15px_rgba(22,199,132,0.1)]" 
              : "border-purple-500/20 bg-[#121935]/40 hover:border-purple-500/40 hover:bg-[#121935]/60"
          }`}
        >
          <input 
            type="file" 
            accept=".html,.htm"
            id="current-drop-input"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) parseHtmlReportFile(e.target.files[0], "current");
            }}
          />
          <label htmlFor="current-drop-input" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            <Upload className="w-10 h-10 text-[#16c784] mb-2 drop-shadow-md" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
              📤 Drop New Daily Market HTML Report
            </h3>
            <p className="text-[11px] text-[#9aa3c7] font-medium max-w-[400px]">
              Upload `marketbeat_report_*` for parsing. This will update the latest reader preview and automatically extract and append a structured log entry under highlights.
            </p>
          </label>
        </div>

      </section>

      {/* Parser Stage block */}
      {pendingUpload && (
        <div className="bg-[#121935] border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Newspaper className="w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#f5b21a]">
                Pending Document Ready to Publish
              </span>
              <h4 className="text-sm font-bold text-white leading-tight mt-0.5">
                {pendingUpload.title}
              </h4>
              <p className="text-[11px] text-[#9aa3c7] font-mono mt-0.5">
                Inferred Date: <span className="text-white font-bold">{pendingUpload.reportDate}</span> | Word Count: {pendingUpload.plainText.split(/\s+/).length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPendingUpload(null)} 
              className="px-3.5 py-1.5 text-xs text-[#9aa3c7] hover:text-white border border-[#243056] hover:bg-white/5 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={savePendingToArchive}
              disabled={isFileLoading}
              className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-[#1ea55d] hover:bg-[#2dc070] text-white rounded-xl transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              {isFileLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Publish & Auto-Log Highlights
            </button>
          </div>
        </div>
      )}

      {/* Split Archive table vs AI analytics panel */}
      <section className="grid grid-cols-1 gap-6 items-start">
        
        {/* Left Column (Full width): Reports Archive List */}
        <div className="col-span-full bg-[#121935] p-5 rounded-3xl border border-[#243056] shadow-xl flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <h3 className="text-md font-extrabold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#cfd8ff]" />
                DAILY HIGHLIGHTS TRACKING LOG
              </h3>
              <p className="text-[10px] text-bento-muted uppercase tracking-wider mt-0.5">Chronological history of extracted key indicators</p>
            </div>
            <span className="text-[10px] bg-purple-500/10 text-purple-300 font-mono px-2 py-0.5 rounded border border-purple-500/20">
              {(currentUser ? dailyNewsLogs : localLogs).length} logs stored
            </span>
          </div>

          {(currentUser ? dailyNewsLogs : localLogs).length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[#243056] rounded-2xl flex flex-col items-center justify-center text-[#9aa3c7] space-y-2">
              <Upload className="w-8 h-8 opacity-20" />
              <p className="text-xs font-medium">Your tracking logs list is currently empty.</p>
              <p className="text-[10px] max-w-[280px]">Upload a Daily Market HTML news file above to automatically extract, log, and render the trends history.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(currentUser ? dailyNewsLogs : localLogs).map((log, uiIdx) => (
                <div key={uiIdx} className="bg-[#0b1020] border border-[#243056] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-indigo-500/30 transition-all text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/25 rounded-xl text-center flex flex-col justify-center min-w-[70px]">
                      <span className="block text-[11px] font-black text-[#5c7cfa] font-mono leading-none">{log.reportDate}</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-tight">
                        {log.title || "Daily Analysis Log"}
                      </h4>
                      {log.reportTimestamp && (
                        <p className="text-[10px] text-amber-400 font-mono font-bold mt-1 flex items-center gap-1">
                          <span>🕐</span> Report timestamp: {log.reportTimestamp}
                        </p>
                      )}
                      <p className="text-[9px] text-[#9aa3c7] font-medium mt-1 uppercase tracking-wide">
                        🎯 {log.actionSummary?.cols?.length || 0} Actions • 🟢 {log.insiderTables?.length || 0} Insider Groups • 📅 {log.macroEvents?.length || 0} Macro Events
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <button 
                      onClick={() => {
                        setActiveLogView(log);
                        setViewMode('reader');
                      }}
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] uppercase font-black px-3 py-1.5 rounded-lg border transition-all cursor-pointer",
                        activeLogView?.id === log.id 
                          ? "bg-indigo-600 text-white border-indigo-400" 
                          : "bg-black/30 text-indigo-300 border-[#243056] hover:bg-indigo-500/15"
                      )}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>View Log</span>
                    </button>
                    <button 
                      onClick={() => handleDeleteDailyLog(log)}
                      className="p-1 px-2 text-[#ea3943] hover:bg-red-500/5 rounded border border-[#ea3943]/20 hover:border-red-500/40 transition-colors"
                      title="Purge Log"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

      </section>

      {/* Interactive Document View Canvas (High Fidelity iframe template render) */}
      {(() => {
        const previewCanvas = (
          <section className={cn(
            "bg-[#121935] p-5 rounded-3xl border border-[#243056] flex flex-col space-y-4 relative transition-all duration-300",
            isImmersiveReaderOpen ? "fixed inset-0 z-[100] bg-[#070b19] p-4 sm:p-6 rounded-none border-0 flex flex-col space-y-4 h-screen w-screen overflow-hidden" : ""
          )}>

        {/* Dynamic Fullscreen Exit & Context Bar */}
        {isImmersiveReaderOpen && (activePreviewReport || activeLogView) && (
          <div className="bg-[#121935]/90 border border-[#243056] p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl shrink-0 backdrop-blur-md animate-fade-in">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <button
                type="button"
                onClick={() => setIsImmersiveReaderOpen(false)}
                className="flex items-center gap-1.5 text-xs font-black text-white bg-red-500/20 border border-red-500/40 px-3.5 py-2.5 rounded-xl hover:bg-red-500 hover:text-white transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-4 h-4 text-red-400 font-bold" />
                <span>Go Back (Full Report)</span>
              </button>
              <div className="text-left sm:hidden">
                <span className="text-[9px] uppercase font-bold text-gray-400 block font-mono">Date</span>
                <span className="text-xs font-black text-[#ecc94b] font-mono">{(activePreviewReport || activeLogView)?.reportDate}</span>
              </div>
            </div>

            <div className="hidden sm:flex flex-col text-center">
              <h4 className="text-[9px] font-black uppercase text-[#cfd8ff]/70 font-mono tracking-widest">⚡ IMMERSIVE READING DESK</h4>
              <p className="text-xs font-black text-white mt-0.5">
                {activeLogView 
                  ? "Extracted Metric Insights Log" 
                  : (activePreviewReport?.reportType === "current" ? "Daily Portfolio News Analysis" : "Cumulative Ticker Scoreboard")
                } ({(activePreviewReport || activeLogView)?.reportDate})
              </p>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2.5 border-t border-white/5 pt-2.5 sm:border-0 sm:pt-0">
              {!activeLogView && activePreviewReport && (
                <div className="flex items-center bg-black/40 border border-[#243056] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewMode('reader')}
                    className={cn(
                      "px-2.5 py-1 rounded text-[9px] uppercase font-black transition-all",
                      viewMode === 'reader' ? "bg-purple-500/30 text-purple-300 shadow-sm" : "text-gray-400 hover:text-white"
                    )}
                  >
                    Readout
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('iframe')}
                    className={cn(
                      "px-2.5 py-1 rounded text-[9px] uppercase font-black transition-all",
                      viewMode === 'iframe' ? "bg-purple-500/30 text-purple-300 shadow-sm" : "text-gray-400 hover:text-white"
                    )}
                  >
                    Iframe
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (activeLogView) {
                    triggerInstantAiInquiry(`Provide a detailed professional breakdown of the exact developments, top winners, and key risks from the extracted metric insights log dated ${activeLogView.reportDate}.`);
                  } else if (activePreviewReport) {
                    triggerInstantAiInquiry(`Discuss the key highlights & macro risks from the ${activePreviewReport.reportType === "current" ? "news analysis" : "scoreboard"} report dated ${activePreviewReport.reportDate}.`);
                  }
                }}
                className="flex items-center gap-1.5 text-[10px] uppercase font-extrabold bg-[#cfd8ff]/10 text-white border border-[#243056] hover:bg-indigo-600 px-3 py-2 rounded-xl transition-all cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
                <span>Ask AI</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile vertical orientation helper banner */}
        {!isImmersiveReaderOpen && (activePreviewReport || activeLogView) && (
          <div className="block lg:hidden bg-indigo-950/40 border border-indigo-500/20 p-3 rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-left">
                <BookOpen className="w-5 h-5 text-indigo-400 flex-shrink-0 animate-pulse" />
                <div className="text-left">
                  <p className="font-extrabold text-[#cfd8ff] text-xs">Mobile Reading Helper</p>
                  <p className="text-[9px] text-[#9aa3c7] font-medium leading-tight">Double borders squeezing your view? Enter distraction-free vertical layout mode!</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsImmersiveReaderOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[9px] uppercase px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap active:scale-95 shrink-0"
              >
                Enter Reader
              </button>
            </div>
          </div>
        )}
        {!isImmersiveReaderOpen && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#243056]">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2 text-left">
                  <Cpu className="w-4 h-4 text-[#ecc94b]" />
                  {activeLogView ? "EXTRACTED METRIC INSIGHTS" : "HIGH-FIDELITY PREVIEW CANVAS"}
                </h3>
                <p className="text-[10px] text-bento-muted uppercase tracking-wider mt-0.5 text-left">
                  {activeLogView ? "Historical indicators and trend logging records" : "Encapsulated high contrast local preview container"}
                </p>
              </div>

              {/* Quick multi-report selection drop list in canvas if not viewing log */}
              {!activeLogView && activeReportsList.length > 0 && (
                <div className="flex items-center gap-2 bg-black/40 border border-[#243056] py-1.5 px-3 rounded-xl shadow-inner">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Active Report:</span>
                  <select
                    value={activePreviewReport ? `${activePreviewReport.reportType}_${activePreviewReport.reportDate}` : ""}
                    onChange={(e) => {
                      const selected = activeReportsList.find(r => `${r.reportType}_${r.reportDate}` === e.target.value);
                      if (selected) {
                        setActivePreviewReport(selected);
                        setActiveLogView(null);
                      }
                    }}
                    className="bg-transparent border-0 text-xs text-white font-bold font-mono outline-none focus:ring-0 cursor-pointer pr-1"
                  >
                    <option value="" disabled className="bg-[#0b1020] text-[#9aa3c7] font-medium">Choose report...</option>
                    {activeReportsList.map((r, rIdx) => (
                      <option 
                        key={rIdx} 
                        value={`${r.reportType}_${r.reportDate}`}
                        className="bg-[#0b1020] text-white font-mono"
                      >
                        {r.reportDate} — {r.reportType === "current" ? "📰 Daily News" : "📊 Scoreboard"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Reset log focus to Live News */}
              {activeLogView && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsImmersiveReaderOpen(true)}
                    className="flex items-center gap-1.5 text-[10px] uppercase font-black bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400/30 px-3.5 py-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-950/40 cursor-pointer"
                    title="Enter Immersive Distraction-Free Fullscreen Mode"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-300" />
                    <span>📱 Fullscreen reading desk</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveLogView(null)}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-300 bg-indigo-500/10 hover:bg-slate-800 border border-indigo-500/20 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer active:scale-95"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Live Newspaper view</span>
                  </button>
                </>
              )}

              {/* Optimized layout View switcher */}
              {!activeLogView && activePreviewReport && (
                <div className="flex items-center bg-black/40 border border-[#243056] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewMode('reader')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1",
                      viewMode === 'reader' ? "bg-purple-500/25 text-purple-300 border border-purple-500/30 font-black shadow-md" : "text-[#9aa3c7] hover:text-white"
                    )}
                  >
                    📱 Mobile Reader
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('iframe')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1",
                      viewMode === 'iframe' ? "bg-purple-500/25 text-purple-300 border border-purple-500/30 font-black shadow-md" : "text-[#9aa3c7] hover:text-white"
                    )}
                  >
                    🌐 HTML Iframe
                  </button>
                </div>
              )}

              {!activeLogView && activePreviewReport && (
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  {/* Type pill */}
                  <span className={cn(
                    "text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-lg border",
                    activePreviewReport.reportType === "current" 
                      ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-300" 
                      : "bg-blue-500/10 border-blue-500/35 text-blue-300"
                  )}>
                    {activePreviewReport.reportType === "current" ? "📰 Daily News" : "📊 Scoreboard"}
                  </span>

                  {/* Ask AI button */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerInstantAiInquiry(`Provide a detailed professional breakdown of the exact developments, top winners, and key risks mentioned in the active ${activePreviewReport.reportType === "current" ? "Daily News Impact Analysis" : "Cumulative Ticker Scoreboard"} report dated ${activePreviewReport.reportDate}.`);
                    }}
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider bg-[#cfd8ff]/10 border border-[#243056] text-white hover:bg-[#cfd8ff]/15 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                    title="Ask AI questions with active preview context"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    Ask AI
                  </button>

                  <span className="text-[10px] uppercase font-mono font-bold bg-[#cfd8ff]/5 border border-[#243056] px-2.5 py-1 rounded-lg text-white">
                    Date: <span className="text-[#ecc94b] font-bold">{activePreviewReport.reportDate}</span>
                  </span>
                  
                  <a 
                    href={`data:text/html;charset=utf-8,${encodeURIComponent(activePreviewReport.htmlContent)}`}
                    download={`marketbeat_${activePreviewReport.reportType}_${activePreviewReport.reportDate}.html`}
                    className="text-[10px] hover:underline text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg"
                  >
                    Download Export <ArrowUpRight className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {activeLogView ? (
          /* GLORIOUS BENTO INDICATORS TRACKING FEED */
          <div className={cn(
            "bg-[#0b1020] border border-[#243056] rounded-2xl p-6 space-y-6 text-left select-text animate-fade-in shadow-2xl",
            isImmersiveReaderOpen 
              ? "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pb-20" 
              : ""
          )}>
            
            {/* Log Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#243056] pb-4 gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>EXTRACTED TRACKING LOG SECTIONS</span>
                </div>
                <h3 className="text-lg font-black text-white mt-1">{activeLogView.title}</h3>
                <p className="text-[10px] text-gray-400">Archived Date: <span className="font-mono text-amber-300 font-bold">{activeLogView.reportDate}</span></p>
              </div>
              
              <button
                type="button"
                onClick={() => setActiveLogView(null)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-3.5 py-2 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Switch to Live Newspaper</span>
              </button>
            </div>

            {/* Section 1: 🎯 Action Summary (Three Columns) */}
            {activeLogView.actionSummary && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span> {activeLogView.actionSummary.title || "Action Summary"}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeLogView.actionSummary.cols?.map((col: any, colIdx: number) => (
                    <div key={colIdx} className={cn(
                      "p-4 rounded-xl border flex flex-col space-y-2 text-left",
                      col.isWin ? "bg-emerald-950/25 border-emerald-500/25 text-emerald-100" :
                      col.isLose ? "bg-red-950/25 border-red-500/25 text-red-100" : "bg-black/30 border-[#243056] text-amber-100"
                    )}>
                      <h5 className={cn(
                        "text-[10px] font-black uppercase tracking-wider border-b pb-1.5 text-left",
                        col.isWin ? "text-emerald-400 border-emerald-500/10" :
                        col.isLose ? "text-red-400 border-red-500/10" : "text-amber-400 border-[#243056]"
                      )}>
                        {col.title}
                      </h5>
                      <ul className="space-y-1.5 text-[11px] leading-normal text-gray-300 flex-1 text-left">
                        {col.items?.map((item: string, itIdx: number) => (
                          <li key={itIdx} className="flex items-start gap-1">
                            <span className="text-gray-500">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                        {(!col.items || col.items.length === 0) && (
                          <span className="text-gray-500 italic block text-xs">No items reported.</span>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: 🟢 Insider Buy (Two columns / boxes) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
              <div className="md:col-span-4 bg-[#0b1020] border border-[#243056] p-4 rounded-xl flex flex-col space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>🟢</span> Insider Cluster Buys
                </h4>
                
                {activeLogView.insiderStats && activeLogView.insiderStats.length > 0 ? (
                  <div className="space-y-2">
                    {activeLogView.insiderStats.map((stat: string, stIdx: number) => (
                      <div key={stIdx} className="bg-[#121935]/40 border border-[#243056] p-2.5 rounded-lg text-[10px] font-medium text-indigo-300 leading-tight">
                        {stat}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-500 italic">No static ratios logged for this period.</p>
                )}
              </div>

              <div className="md:col-span-8 bg-[#0b1020] border border-[#243056] p-4 rounded-xl overflow-hidden flex flex-col space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>📋</span> Recorded Clusters
                </h4>
                
                <div className="overflow-x-auto">
                  {activeLogView.insiderTables && activeLogView.insiderTables.length > 0 ? (
                    activeLogView.insiderTables.map((tbl: any, tblIdx: number) => (
                      <table key={tblIdx} className="w-full text-left text-[10px] border-collapse">
                        <thead>
                          <tr className="border-b border-[#243056] text-gray-400">
                            {tbl.headers?.map((hdr: string, hdrIdx: number) => (
                              <th key={hdrIdx} className="pb-2 font-black uppercase tracking-wider">{hdr}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-gray-300">
                          {tbl.rows?.map((row: any, rowIdx: number) => {
                            const cells = Array.isArray(row) ? row : (row?.cells || []);
                            return (
                              <tr key={rowIdx} className="hover:bg-white/5 transition-colors">
                                {cells.map((cell: any, cellIdx: number) => (
                                  <td key={cellIdx} className="py-2 pr-2">
                                    {cell.text}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ))
                  ) : (
                    <p className="text-[10px] text-gray-500 italic">No insider transaction tables logged.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: 📅 Macro Weekly Calendar Summary */}
            <div className="bg-black/20 border border-[#243056] p-4 rounded-xl space-y-3 pt-4">
              <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>📅</span> Macro Calendar summary
              </h4>
              {activeLogView.macroRegime && (
                <div className="border border-amber-500/15 bg-amber-500/5 p-3 rounded-lg flex flex-col space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 leading-none">Regime Focus</span>
                  <span className="text-xs font-bold text-white font-mono leading-tight">{activeLogView.macroRegime}</span>
                  {activeLogView.macroLede && <p className="text-[10px] text-gray-300 leading-normal mt-1">{activeLogView.macroLede}</p>}
                </div>
              )}

              {activeLogView.macroEvents && activeLogView.macroEvents.length > 0 ? (
                <div className="overflow-x-auto text-left">
                  <table className="w-full text-left text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#243056] text-gray-400">
                        <th className="pb-2 font-black uppercase tracking-wider">When (EST)</th>
                        <th className="pb-2 font-black uppercase tracking-wider">Indicator / Event</th>
                        <th className="pb-2 font-black uppercase tracking-wider text-center">Reference / Consensus</th>
                        <th className="pb-2 font-black uppercase tracking-wider text-right">Delta / Release</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-gray-300">
                      {activeLogView.macroEvents.map((ev: any, evIdx: number) => (
                        <tr key={evIdx} className="hover:bg-white/5 transition-colors align-top">
                          <td className="py-2 font-mono text-purple-400 font-bold whitespace-nowrap">{ev.when}</td>
                          <td className="py-2 font-bold pr-3">{ev.kl}</td>
                          <td className="py-2 text-center text-gray-300 font-mono pr-2">{ev.kv}</td>
                          <td className={cn(
                            "py-2 text-right font-mono font-bold",
                            ev.className?.includes("pos") ? "text-emerald-400" :
                            ev.className?.includes("neg") ? "text-red-400" : "text-amber-400"
                          )}>{ev.kd || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[10px] text-gray-500 italic">No weekly macro events logged in log entry.</p>
              )}
            </div>

          </div>
        ) : activePreviewReport ? (
          viewMode === 'iframe' ? (
            <div className={cn(
              "w-full relative bg-black shadow-inner overflow-hidden",
              isImmersiveReaderOpen 
                ? "flex-1 h-full min-h-[500px] border-0" 
                : "border border-[#243056] rounded-2xl h-[700px]"
            )}>
              <iframe 
                ref={iframeRef}
                onLoad={handleIframeLoad}
                srcDoc={activePreviewReport.htmlContent}
                title="Report Canvas Frame"
                className={cn(
                  "w-full h-full border-0 animate-fade-in",
                  !isImmersiveReaderOpen && "rounded-2xl"
                )}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : (
            /* BREATHTAKING STYLIZED RESPONSIVE CUSTOM NATIVE MOBILE READER */
            <BeautifulNewsReader 
              report={activePreviewReport} 
              triggerInstantAiInquiry={triggerInstantAiInquiry} 
              styleClass={cn(
                "border-0 bg-transparent p-0",
                isImmersiveReaderOpen 
                  ? "flex-[#cfd8ff] flex-1 overflow-y-auto p-4 md:p-10 pb-36 max-h-none" 
                  : "max-h-[750px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
              )}
            />
          )
        ) : (
          <div className="p-16 text-center border border-dashed border-[#243056] rounded-2xl flex flex-col items-center justify-center text-[#9aa3c7] space-y-3">
            <Newspaper className="w-10 h-10 opacity-15" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#9aa3c7]/65">No Active Preview Document Selected</p>
            <p className="text-[10px] max-w-[340px]">Select any of the uploaded Analysis badges or Scoreboard entries in the chronology archive to render their high-fidelity templates.</p>
          </div>
        )}
      </section>
        );

        return isImmersiveReaderOpen ? (
          <>
            <div className="bg-[#121935]/40 border border-[#243056]/50 rounded-3xl text-center text-xs text-[#9aa3c7] flex flex-col gap-2 items-center justify-center p-16 shadow-inner">
              <BookOpen className="w-8 h-8 text-indigo-400 animate-pulse" />
              <p className="font-bold uppercase tracking-wider text-[#cfd8ff] mt-2">Reading desk is active in Fullscreen</p>
              <p className="text-[10px] max-w-sm">You are reading distraction-free on your device. Click "Go Back" in the overlay header to return to the dashboard.</p>
              <button
                type="button"
                onClick={() => setIsImmersiveReaderOpen(false)}
                className="mt-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded-xl border border-indigo-400/30 text-[10px] uppercase transition-all cursor-pointer shadow-md active:scale-95"
              >
                Return to Dashboard
              </button>
            </div>
            {createPortal(previewCanvas, document.body)}
          </>
        ) : previewCanvas;
      })()}

    </div>
  );
}
