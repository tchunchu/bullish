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
import { UploadedHtmlReport } from '../types';
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
          if (cells.length > 0) rows.push(cells);
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
      insidersData
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

  // AI Chat Assistant State specifically tuned for portfolio trend tracking
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { 
      role: 'assistant', 
      content: '🔮 **Welcome to the Trend Analytics assistant.** I have real-time semantic access to each of your uploaded Daily Analyses and Cumulative Scoreboards. Ask me any technical trends, winner-rotation questions, or Brent oil geopolitical shifts!' 
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
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
    const keys = Object.keys(localStorage).filter(k => k.startsWith('local_html_report_'));
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

  // Safe active remote query stream from Firestore
  useEffect(() => {
    if (!currentUser) {
      loadLocalReports();
      return;
    }

    const reportsRef = collection(db, "uploaded_html_reports");
    const q = query(
      reportsRef,
      where("userId", "==", currentUser.uid),
      orderBy("reportDate", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: UploadedHtmlReport[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UploadedHtmlReport);
      });
      setUploadedReports(list);

      // Default active preview to latest if not set
      if (list.length > 0 && !activePreviewReport) {
        setActivePreviewReport(list[0]);
      }
    }, (err) => {
      console.error("onSnapshot error:", err);
      handleFirestoreError(err, OperationType.LIST, "uploaded_html_reports");
    });

    return () => unsubscribe();
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

        // Clean extract date from title matching YYYY-MM-DD
        const dateMatches = html.match(/\b\d{4}-\d{2}-\d{2}\b/g);
        let extractedDate = new Date().toISOString().split("T")[0]; // default fallback
        if (dateMatches && dateMatches.length > 0) {
          const sorted = [...dateMatches].sort();
          extractedDate = sorted[sorted.length - 1]; // Pick latest reference date
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

    if (!currentUser) {
      // Local storage fallback for convenience
      try {
        const localKey = `local_html_report_${pendingUpload.reportType}_${pendingUpload.reportDate}`;
        const newLocalItem: UploadedHtmlReport = {
          id: `${pendingUpload.reportType}_${pendingUpload.reportDate}`,
          userId: "anonymous",
          reportType: pendingUpload.reportType,
          reportDate: pendingUpload.reportDate,
          title: pendingUpload.title,
          htmlContent: pendingUpload.htmlContent,
          plainText: pendingUpload.plainText,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(localKey, JSON.stringify(newLocalItem));
        setSuccessMsg(`[Local Cache] Overwritten & saved locally for: ${pendingUpload.title}`);
        setPendingUpload(null);
        loadLocalReports();
        
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
      // Stable compound key ensure overwrite capability
      const docId = `${currentUser.uid}_${pendingUpload.reportType}_${pendingUpload.reportDate}`;
      const reportRef = doc(db, "uploaded_html_reports", docId);

      const payload = {
        userId: currentUser.uid,
        reportType: pendingUpload.reportType,
        reportDate: pendingUpload.reportDate,
        title: pendingUpload.title,
        htmlContent: pendingUpload.htmlContent,
        plainText: pendingUpload.plainText,
        timestamp: serverTimestamp()
      };

      await setDoc(reportRef, payload);

      setSuccessMsg(`Archived successfully & securely to Firestore. Date: ${pendingUpload.reportDate}`);
      
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
        const localKey = `local_html_report_${report.reportType}_${report.reportDate}`;
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
      setSuccessMsg(`Successfully purged from database: ${report.reportDate}`);
      if (activePreviewReport?.id === report.id) {
        setActivePreviewReport(null);
      }
    } catch (err: any) {
      setErrorMsg(`Deletion failed: ${err.message}`);
      handleFirestoreError(err, OperationType.DELETE, `uploaded_html_reports/${report.id}`);
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

    // Open/Slide up the unified AI Companion Panel
    setIsAiPanelOpen(true);

    // Only scroll the background dashboard container on desktop screens
    if (window.innerWidth >= 1024) {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setChatMessages(prev => [...prev, { role: 'user', content: customPrompt }]);
    setUserInput('');
    setChatLoading(true);

    try {
      const reportsContext = activeReportsList
        .slice(0, 8)
        .map(r => `[REPORT TYPE: ${r.reportType.toUpperCase()} | DATE: ${r.reportDate} | TITLE: ${r.title}]\n${r.plainText}`)
        .join("\n\n");

      const systemPrompt = `You are an elite quantitative researcher and portfolio analyst in "Market Beat", a specialized research terminal.
You are given the plain-text semantic version of multiple uploaded high-fidelity HTML reports from the user's secure archive (last 5 business days).
Use this aggregated historical context to answer the user's specific inquiry. Focus on identifying trends, matching price momentum, counting volume flips, or assessing Brent crude oil risk escalation.

HISTORICAL AND TREND REVENUE ARCHIVE DATA:
${reportsContext || "No reports have been uploaded yet. Encourage the user to drop HTML files above."}`;

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = await ai.models.generateContentStream({
        model: MODELS.FLASH,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUSER QUESTION: ${customPrompt}` }] }
        ]
      });

      let accumulated = "";
      for await (const chunk of stream) {
        accumulated += chunk.text || "";
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch (err: any) {
      console.error("AI trends prediction failed:", err);
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', content: `⚠️ **AI Intelligence Error**: ${err?.message || 'Failed to complete trend analysis inquiry. Please check your API key setup.'}` }
      ]);
    } finally {
      setChatLoading(false);
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

  // Call Gemini trends intelligence
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userMessage = userInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setUserInput('');
    setChatLoading(true);

    try {
      // Aggregate text context from all relevant rolling archive reports
      const reportsContext = activeReportsList
        .slice(0, 8) // Include up to last 8 items across both types to capture full trends context
        .map(r => `[REPORT TYPE: ${r.reportType.toUpperCase()} | DATE: ${r.reportDate} | TITLE: ${r.title}]\n${r.plainText}`)
        .join("\n\n");

      const systemPrompt = `You are an elite quantitative researcher and portfolio analyst in "Market Beat", a specialized research terminal.
You are given the plain-text semantic version of multiple uploaded high-fidelity HTML reports from the user's secure archive (last 5 business days).
Use this aggregated historical context to answer the user's specific inquiry. Focus on identifying trends, matching price momentum, counting volume flips, or assessing Brent crude oil risk escalation.

HISTORICAL AND TREND REVENUE ARCHIVE DATA:
${reportsContext || "No reports have been uploaded yet. Encourage the user to drop HTML files above."}`;

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = await ai.models.generateContentStream({
        model: MODELS.FLASH,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUSER QUESTION: ${userMessage}` }] }
        ]
      });

      let accumulated = "";
      for await (const chunk of stream) {
        accumulated += chunk.text || "";
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch (err: any) {
      console.error("AI trends prediction failed:", err);
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', content: `⚠️ **AI Intelligence Error**: ${err?.message || 'Failed to complete trend analysis inquiry. Please check your API key setup.'}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleApplyPresetQuestion = (q: string) => {
    triggerInstantAiInquiry(q);
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
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Dropzone A: Daily News analysis */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setDragCurrentActive(true); }}
          onDragLeave={() => setDragCurrentActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragCurrentActive(false);
            if (e.dataTransfer.files?.length > 0) parseHtmlReportFile(e.dataTransfer.files[0], "current");
          }}
          className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative ${
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
            <Upload className="w-8 h-8 text-[#16c784] mb-2 drop-shadow-md" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
              📤 Drop Current Report
            </h3>
            <p className="text-[11px] text-[#9aa3c7] font-medium max-w-[200px]">
              Upload modern News Impact Analysis Template (`marketbeat_report_*`)
            </p>
          </label>
        </div>

        {/* Dropzone B: Scoreboard */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setDragStatusActive(true); }}
          onDragLeave={() => setDragStatusActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragStatusActive(false);
            if (e.dataTransfer.files?.length > 0) parseHtmlReportFile(e.dataTransfer.files[0], "status");
          }}
          className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative ${
            dragStatusActive 
              ? "border-[#3b82f6] bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
              : "border-purple-500/20 bg-[#121935]/40 hover:border-purple-500/40 hover:bg-[#121935]/60"
          }`}
        >
          <input 
            type="file" 
            accept=".html,.htm"
            id="status-drop-input"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) parseHtmlReportFile(e.target.files[0], "status");
            }}
          />
          <label htmlFor="status-drop-input" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            <Layers className="w-8 h-8 text-[#3b82f6] mb-2 drop-shadow-md" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
              📈 Drop Scoreboard Report
            </h3>
            <p className="text-[11px] text-[#9aa3c7] font-medium max-w-[200px]">
              Upload Multi-Day Ticker Cumulative Scoreboard (`market_scoreboard_*`)
            </p>
          </label>
        </div>

      </section>

      {/* Parser Stage block */}
      {pendingUpload && (
        <div className="bg-[#121935] border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in shadow-xl">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${pendingUpload.reportType === "current" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
              {pendingUpload.reportType === "current" ? <Newspaper className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
            </div>
            <div>
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
              className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-[#1ea55d] hover:bg-[#2dc070] text-white rounded-xl transition-all flex items-center gap-1.5 shadow-md"
            >
              {isFileLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save & Overwrite Date Target
            </button>
          </div>
        </div>
      )}

      {/* Split Archive table vs AI analytics panel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Grid width 7): Reports Archive List */}
        <div className="lg:col-span-7 bg-[#121935] p-5 rounded-3xl border border-[#243056] shadow-xl flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-md font-extrabold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#cfd8ff]" />
                REPORT CHRONOLOGY ARCHIVE
              </h3>
              <p className="text-[10px] text-bento-muted uppercase tracking-wider mt-0.5">Rolling last 5 uploaded analysis dates</p>
            </div>
            <span className="text-[10px] bg-purple-500/10 text-purple-300 font-mono px-2 py-0.5 rounded border border-purple-500/20">
              {activeReportsList.length} files stored
            </span>
          </div>

          {groupedReports.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[#243056] rounded-2xl flex flex-col items-center justify-center text-[#9aa3c7] space-y-2">
              <Upload className="w-8 h-8 opacity-20" />
              <p className="text-xs font-medium">Your reports chronology list is currently empty.</p>
              <p className="text-[10px] max-w-[280px]">Drop daily `.html` files in the upload zones above to build your high-fidelity trends archive.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedReports.map((group, uiIdx) => (
                <div key={uiIdx} className="bg-[#0b1020] border border-[#243056] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-purple-500/20 transition-all">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-[#cfd8ff]/5 border border-[#243056] rounded-xl text-center flex flex-col justify-center min-w-[70px]">
                      <span className="block text-[11px] font-black text-white font-mono leading-none">{group.date}</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white capitalize leading-tight">
                        Daily Portfolio Snapshot
                      </h4>
                      <p className="text-[10px] text-[#9aa3c7] font-medium mt-0.5">
                        {group.current && group.status ? "Complete double-matrix archived" : "Partial session uploaded"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Current analysis slot */}
                    {group.current ? (
                      <div className="flex items-center gap-1 bg-[#153434]/50 border border-emerald-500/15 rounded-lg pl-2.5 pr-1 py-1">
                        <span className="text-[10px] font-bold text-emerald-400">Current</span>
                        <button 
                          onClick={() => setActivePreviewReport(group.current!)}
                          className={cn("p-1 rounded hover:bg-white/10 transition-colors", activePreviewReport?.reportType === "current" && activePreviewReport?.reportDate === group.current.reportDate && "bg-[#16c784] text-black hover:text-black")}
                          title="Preview HTML Report"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-300" />
                        </button>
                        <button 
                          onClick={() => handleDeleteReport(group.current!)}
                          className="p-1 text-[#ea3943] hover:text-red-300 transition-colors"
                          title="Purge"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-white/20 border border-white/5 bg-[#121935] px-2 py-1 rounded-lg">No Daily Report</span>
                    )}

                    {/* Status analysis slot */}
                    {group.status ? (
                      <div className="flex items-center gap-1 bg-[#1a2c4a]/50 border border-blue-500/15 rounded-lg pl-2.5 pr-1 py-1">
                        <span className="text-[10px] font-bold text-blue-400">Scoreboard</span>
                        <button 
                          onClick={() => setActivePreviewReport(group.status!)}
                          className={cn("p-1 rounded hover:bg-white/10 transition-colors", activePreviewReport?.reportType === "status" && activePreviewReport?.reportDate === group.status.reportDate && "bg-[#3b82f6] text-black hover:text-black")}
                          title="Preview Cumulative Report"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-300" />
                        </button>
                        <button 
                          onClick={() => handleDeleteReport(group.status!)}
                          className="p-1 text-[#ea3943] hover:text-red-300 transition-colors"
                          title="Purge"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-white/20 border border-white/5 bg-[#121935] px-2 py-1 rounded-lg">No Scoreboard</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Right Column (Grid width 5): Trends Chat studio */}
        <div ref={chatSectionRef} className="lg:col-span-5 bg-[#121935] p-5 rounded-3xl border border-[#243056] shadow-xl flex flex-col space-y-4 h-[420px]">
          <div>
            <h3 className="text-md font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              TRENDS INTELLIGENCE AGENT
            </h3>
            <p className="text-[10px] text-bento-muted uppercase tracking-wider mt-0.5">Semantic reasoning across rolling archive history</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-[#0b1020] rounded-2xl scrollbar-thin scrollbar-thumb-white/5 text-left select-text">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex flex-col max-w-[85%] rounded-xl p-3 text-xs leading-relaxed",
                msg.role === 'user' 
                  ? "bg-[#cfd8ff]/10 text-white border border-[#243056] ml-auto rounded-tr-none" 
                  : "bg-[#1f2a55]/40 text-[#cfd8ff] border border-blue-500/10 rounded-tl-none whitespace-pre-line"
              )}>
                <span className="text-[9px] font-mono opacity-50 uppercase tracking-widest mb-1">
                  {msg.role === 'user' ? 'Client Request' : 'Trends Studio'}
                </span>
                <div>{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="bg-[#1f2a55]/20 text-[#cfd8ff] border border-blue-500/5 rounded-xl rounded-tl-none p-3 max-w-[85%] flex items-center gap-2 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Scanning parsed chronology patterns...</span>
              </div>
            )}
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5 justify-start">
            <button 
              onClick={() => handleApplyPresetQuestion("What are the core winners over the last week?")}
              className="text-[9px] px-2 py-1 border border-white/5 font-bold rounded-lg bg-black/20 text-[#cfd8ff] hover:bg-white/5 hover:text-white transition-all whitespace-nowrap"
            >
              🏆 Winners Check
            </button>
            <button 
              onClick={() => handleApplyPresetQuestion("Assess the Brent crude oil trend and escalation impacts")}
              className="text-[9px] px-2 py-1 border border-white/5 font-bold rounded-lg bg-black/20 text-[#cfd8ff] hover:bg-white/5 hover:text-white transition-all whitespace-nowrap"
            >
              🛢️ Oil & Risks
            </button>
            <button 
              onClick={() => handleApplyPresetQuestion("Compare cryptocurrency safe haven behavior with gold")}
              className="text-[9px] px-2 py-1 border border-white/5 font-bold rounded-lg bg-black/20 text-[#cfd8ff] hover:bg-white/5 hover:text-white transition-all whitespace-nowrap"
            >
              🪙 Crypto vs Gold
            </button>
          </div>

          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input 
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={chatLoading}
              placeholder="Ask Trends Agent (e.g. Compare NVIDIA scores)..."
              className="flex-1 bg-black/30 border border-[#243056] px-3.5 py-2 text-xs rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none placeholder-[#9aa3c7]/50 text-white"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="p-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
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
        {isImmersiveReaderOpen && activePreviewReport && (
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
                <span className="text-xs font-black text-[#ecc94b] font-mono">{activePreviewReport.reportDate}</span>
              </div>
            </div>

            <div className="hidden sm:flex flex-col text-center">
              <h4 className="text-[9px] font-black uppercase text-[#cfd8ff]/70 font-mono tracking-widest">⚡ IMMERSIVE READING DESK</h4>
              <p className="text-xs font-black text-white mt-0.5">{activePreviewReport.reportType === "current" ? "Daily Portfolio News Analysis" : "Cumulative Ticker Scoreboard"} ({activePreviewReport.reportDate})</p>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2.5 border-t border-white/5 pt-2.5 sm:border-0 sm:pt-0">
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

              <button
                type="button"
                onClick={() => {
                  triggerInstantAiInquiry(`Discuss the key highlights & macro risks from the ${activePreviewReport.reportType === "current" ? "news analysis" : "scoreboard"} report dated ${activePreviewReport.reportDate}.`);
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
        {!isImmersiveReaderOpen && activePreviewReport && (
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
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#ecc94b]" />
                  HIGH-FIDELITY PREVIEW CANVAS
                </h3>
                <p className="text-[10px] text-bento-muted uppercase tracking-wider mt-0.5">Encapsulated high contrast local preview container</p>
              </div>

              {/* Quick multi-report selection drop list in canvas */}
              {activeReportsList.length > 0 && (
                <div className="flex items-center gap-2 bg-black/40 border border-[#243056] py-1.5 px-3 rounded-xl shadow-inner">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Active Report:</span>
                  <select
                    value={activePreviewReport ? `${activePreviewReport.reportType}_${activePreviewReport.reportDate}` : ""}
                    onChange={(e) => {
                      const selected = activeReportsList.find(r => `${r.reportType}_${r.reportDate}` === e.target.value);
                      if (selected) setActivePreviewReport(selected);
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
              {/* Optimized layout View switcher */}
              {activePreviewReport && (
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

              {activePreviewReport && (
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

                  {/* Sibling Toggle button if available */}
                  {siblingReport && (
                    <button
                      type="button"
                      onClick={() => setActivePreviewReport(siblingReport)}
                      className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                      title={`Switch to matching ${siblingReport.reportType === "current" ? "Daily News Report" : "Cumulative Scoreboard"} for ${activePreviewReport.reportDate}`}
                    >
                      <RefreshCw className="w-2.5 h-2.5 text-amber-300" />
                      Swap View
                    </button>
                  )}

                  {/* Ask AI button */}
                  <button
                    type="button"
                    onClick={() => {
                      setUserInput(`Provide a detailed professional breakdown of the exact developments, top winners, and key risks mentioned in the active ${activePreviewReport.reportType === "current" ? "Daily News Impact Analysis" : "Cumulative Ticker Scoreboard"} report dated ${activePreviewReport.reportDate}.`);
                    }}
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider bg-[#cfd8ff]/10 border border-[#243056] text-white hover:bg-[#cfd8ff]/15 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                    title="Ask AI questions with active preview context"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    Ask AI
                  </button>

                  {/* Immersive Mobile-Oriented Fullscreen Reader Button */}
                  <button
                    type="button"
                    onClick={() => setIsImmersiveReaderOpen(true)}
                    className="flex items-center gap-1.5 text-[10px] uppercase font-black bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400/30 px-3 py-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-950/40 cursor-pointer"
                    title="Enter Immersive Distraction-Free Fullscreen Mode"
                  >
                    <BookOpen className="w-3 h-3 text-amber-300" />
                    <span>📱 Fullscreen reading desk</span>
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

        {activePreviewReport ? (
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

      {/* Floating AI Companion Trigger Badge (Persistent Toggle) */}
      {typeof (window as any).triggerUniversalAiInquiry !== 'function' && (
        <div className={cn(
          "fixed bottom-6 right-6 flex flex-col items-end gap-2 text-right pointer-events-none transition-all duration-300",
          isImmersiveReaderOpen ? "z-[110]" : "z-40"
        )}>
          {/* Help tooltip pop */}
          {!isAiPanelOpen && (
            <span className="bg-[#121935] border border-[#243056] text-[#cfd8ff] text-[9px] font-bold uppercase py-1 px-2.5 rounded-lg shadow-xl font-mono tracking-wider animate-bounce select-none pointer-events-auto">
              ⚡ Tap Report lines to Ask AI
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setIsAiPanelOpen(!isAiPanelOpen);
            }}
            className="pointer-events-auto bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold flex items-center gap-2 p-3 sm:px-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 border border-[#cfd8ff]/20 cursor-pointer"
          >
            <div className="relative">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              {chatLoading && (
                <span className="absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0b1020] animate-ping" />
              )}
            </div>
            <span className="text-xs tracking-wider hidden sm:inline uppercase font-bold">Trends Companion {isAiPanelOpen ? "Close" : "Open"}</span>
          </button>
        </div>
      )}

      {/* Floating / Docked AI Companion Panel Sheet */}
      {typeof (window as any).triggerUniversalAiInquiry !== 'function' && isAiPanelOpen && (
        <div className={cn(
          "fixed bottom-0 right-0 bg-[#121935] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 transform translate-y-0",
          isImmersiveReaderOpen
            ? "inset-x-0 bottom-0 top-[10px] sm:top-auto sm:right-6 sm:bottom-6 sm:left-auto sm:w-[480px] sm:h-[650px] border-t border-[#243056] sm:border sm:rounded-3xl rounded-t-3xl z-[120]"
            : "w-full sm:w-[480px] h-[75vh] sm:h-[620px] bottom-0 right-0 sm:bottom-6 sm:right-6 border-t sm:border border-[#243056] rounded-t-3xl sm:rounded-3xl z-50"
        )}>
          
          {/* Header */}
          <div className="bg-[#1a2347] px-4 py-3.5 border-b border-[#243056] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 w-7 h-7 bg-purple-500/10 rounded-lg border border-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Trends AI Quick Desk</h4>
                <p className="text-[9px] text-emerald-400 font-mono font-medium flex items-center gap-1 leading-none mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Sync Companion
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setChatMessages([
                    { role: 'assistant', content: '📊 Ask me any quantitative inquiries regarding your active high-fidelity report snapshot. Tab any row, news badge, or event to begin!' }
                  ]);
                }}
                className="p-1 px-2 text-[9px] uppercase font-black tracking-wider text-gray-400 bg-black/40 hover:bg-black/60 rounded-lg hover:text-white transition-all cursor-pointer border border-[#243056]/40"
                title="Clear Desk Messages"
              >
                Reset
              </button>
              
              <button
                type="button"
                onClick={() => setIsAiPanelOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                title="Collapse Companion"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#0b1020] text-left select-text scrollbar-thin scrollbar-thumb-white/5">
            {chatMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className={cn(
                  "flex flex-col max-w-[90%] sm:max-w-[85%] rounded-xl p-3.5 text-[11px] leading-relaxed transition-all shadow-md",
                  isUser 
                    ? "bg-[#cfd8ff]/10 text-white border border-[#243056] ml-auto rounded-tr-none font-medium whitespace-pre-wrap" 
                    : "bg-[#1f2a55]/60 text-[#cfd8ff] border border-blue-500/15 rounded-tl-none"
                )}>
                  <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-white/5 pb-1 opacity-65">
                    <span className="text-[8px] font-mono uppercase tracking-widest font-bold text-[#cfd8ff]">
                      {isUser ? 'Client Request' : 'Trends Studio Analysis'}
                    </span>
                    <span className="text-[8px] opacity-40 font-mono">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {isUser ? (
                    <div>{msg.content}</div>
                  ) : (
                    <div className="prose prose-invert max-w-none text-[11px] text-[#cfd8ff] space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children, ...props }) => <h1 className="text-xs font-black text-white mt-3 mb-1.5 uppercase tracking-wider border-b border-indigo-500/20 pb-0.5" {...props}>{children}</h1>,
                          h2: ({ children, ...props }) => <h2 className="text-[11px] font-black text-white mt-2.5 mb-1.5 uppercase tracking-wider" {...props}>{children}</h2>,
                          h3: ({ children, ...props }) => <h3 className="text-[10px] font-black text-amber-400 mt-2.5 mb-1" {...props}>{children}</h3>,
                          p: ({ children, ...props }) => <p className="text-[11px] leading-relaxed mb-2 text-[#cfd8ff]/90" {...props}>{children}</p>,
                          ul: ({ children, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props}>{children}</ul>,
                          ol: ({ children, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props}>{children}</ol>,
                          li: ({ children, ...props }) => <li className="text-[11px] text-[#cfd8ff]/90 leading-relaxed" {...props}>{children}</li>,
                          strong: ({ children, ...props }) => <strong className="font-extrabold text-white animate-pulse" {...props}>{children}</strong>,
                          em: ({ children, ...props }) => <em className="italic text-indigo-300 font-medium" {...props}>{children}</em>,
                          table: ({ children, ...props }) => (
                            <div className="overflow-x-auto w-full my-3 border border-indigo-500/20 rounded-xl bg-black/40">
                              <table className="w-full text-left border-collapse text-[10px] min-w-[240px]" {...props}>{children}</table>
                            </div>
                          ),
                          thead: ({ children, ...props }) => <thead className="bg-[#1f2a55]/60 border-b border-[#243056]" {...props}>{children}</thead>,
                          th: ({ children, ...props }) => <th className="p-2 font-black font-mono text-white uppercase tracking-wider border border-[#243056]/40 text-[9px]" {...props}>{children}</th>,
                          tbody: ({ children, ...props }) => <tbody className="divide-y divide-[#243056]/30" {...props}>{children}</tbody>,
                          tr: ({ children, ...props }) => <tr className="hover:bg-indigo-500/5 odd:bg-[#1a2347]/10" {...props}>{children}</tr>,
                          td: ({ children, ...props }) => <td className="p-2 font-mono text-[#cfd8ff]/90 border border-[#243056]/20" {...props}>{children}</td>,
                          code: ({ className, children, ...props }: any) => {
                            const isMultiline = String(children || '').includes('\n');
                            return !isMultiline ? (
                              <code className="font-mono bg-black/50 px-1 py-0.5 rounded text-[10px] text-[#ecc94b] font-bold" {...props}>{children}</code>
                            ) : (
                              <pre className="bg-black/60 p-2.5 rounded-xl border border-[#243056]/50 overflow-x-auto my-2">
                                <code className={cn("font-mono text-[10px] text-emerald-400 block", className)} {...props}>{children}</code>
                              </pre>
                            );
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
            
            {chatLoading && (
              <div className="bg-[#1f2a55]/30 text-[#cfd8ff] border border-blue-500/10 rounded-xl rounded-tl-none p-3 max-w-[85%] flex items-center gap-2 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="font-mono text-[9px] uppercase tracking-wide">Synthesizing trends...</span>
              </div>
            )}
          </div>

          {/* Helper Suggestions Box inside Quick Drawer */}
          <div className="px-3.5 py-2.5 bg-[#121935] border-t border-[#243056]/30 flex gap-2 overflow-x-auto select-none no-scrollbar items-center">
            <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider flex-shrink-0 font-mono">Presets:</span>
            <button 
              onClick={() => handleApplyPresetQuestion("What are the core winners over the last week?")}
              className="text-[9px] px-2 py-1 border border-white/5 font-extrabold rounded-lg bg-black/20 text-[#cfd8ff] hover:bg-[#cfd8ff]/10 hover:text-white transition-all whitespace-nowrap"
            >
              🏆 Winners Check
            </button>
            <button 
              onClick={() => handleApplyPresetQuestion("Assess the Brent crude oil trend and escalation impacts")}
              className="text-[9px] px-2 py-1 border border-white/5 font-extrabold rounded-lg bg-[#ccbc33]/20 text-[#ecc94b] hover:bg-[#cfd8ff]/10 hover:text-white transition-all whitespace-nowrap"
            >
              🛢️ Oil & Risks
            </button>
            <button 
              onClick={() => handleApplyPresetQuestion("Compare cryptocurrency safe haven behavior with gold")}
              className="text-[9px] px-2 py-1 border border-white/5 font-extrabold rounded-lg bg-black/20 text-[#cfd8ff] hover:bg-[#cfd8ff]/10 hover:text-white transition-all whitespace-nowrap"
            >
              🪙 Crypto vs Gold
            </button>
          </div>

          {/* Form input */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (!userInput.trim()) return;
              triggerInstantAiInquiry(userInput.trim());
            }}
            className="p-3 bg-[#121935] border-t border-[#243056] flex gap-2"
          >
            <input 
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={chatLoading}
              placeholder="Ask Companion follow-up..."
              className="flex-1 bg-black/40 border border-[#243056] px-3.5 py-2 text-xs rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-white placeholder-gray-500 font-medium"
            />
            <button
              type="submit"
              disabled={chatLoading || !userInput.trim()}
              className="p-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
