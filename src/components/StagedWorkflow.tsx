import { useState, useEffect } from 'react';
import { 
  Network, 
  Cpu, 
  TrendingUp, 
  TrendingDown, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  HelpCircle, 
  History, 
  Sparkles, 
  Play, 
  Database, 
  Newspaper, 
  X, 
  ArrowUpRight, 
  Lock,
  Workflow
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface StagedMarketItem {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
}

interface StagedNewsItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source?: string;
  score?: number;
  subject?: string;
  twoWordAssessment?: string;
  oneLineJustification?: string;
}

interface StagedDataPayload {
  success: boolean;
  timestamp: string;
  marketData: StagedMarketItem[];
  newsArticles: StagedNewsItem[];
}

export function StagedWorkflow() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Staging Pipeline States
  const [stagedData, setStagedData] = useState<StagedDataPayload | null>(null);
  const [loadingHarvest, setLoadingHarvest] = useState(false);
  const [loadingRating, setLoadingRating] = useState(false);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [revealDump, setRevealDump] = useState(false);

  // Curation and Guidance States
  const [selectedArticles, setSelectedArticles] = useState<StagedNewsItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<string[]>([]);
  const [userIntent, setUserIntent] = useState('');
  const [newsSourceFilter, setNewsSourceFilter] = useState<string>('ALL');

  // Synthesis Inference States
  const [loadingSynthesis, setLoadingSynthesis] = useState(false);
  const [synthesisLogs, setSynthesisLogs] = useState<string[]>([]);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);

  // Firestore Sync States
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Quick Assist & Watchlist impact analysis states
  const [quickReadArticle, setQuickReadArticle] = useState<StagedNewsItem | null>(null);
  const [quickReadAnalysis, setQuickReadAnalysis] = useState<any | null>(null);
  const [loadingQuickRead, setLoadingQuickRead] = useState(false);
  const [quickReadError, setQuickReadError] = useState<string | null>(null);

  // Track the logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleQuickReadArticle = async (art: StagedNewsItem) => {
    setQuickReadArticle(art);
    setLoadingQuickRead(true);
    setQuickReadAnalysis(null);
    setQuickReadError(null);

    // Auto-scroll inside container to the board
    setTimeout(() => {
      const element = document.getElementById("headline-intelligence-board");
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);

    try {
      const watchlistStr = localStorage.getItem('watchlist_tickers') || 'AAPL, MSFT, GOOGL, NVDA, TSLA, AMD, META, NFLX, AMZN, AVGO';
      const response = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: art.title,
          link: art.link,
          watchlist: watchlistStr
        })
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        setQuickReadAnalysis(resData.data);
      } else {
        throw new Error(resData.error || "No intelligence payload returned.");
      }
    } catch (err: any) {
      console.error("Quick Read analyzer failed:", err);
      setQuickReadError(err.message || "An unexpected error occurred during deep narrative analysis.");
    } finally {
      setLoadingQuickRead(false);
    }
  };

  const getTickersBreakdown = () => {
    if (!quickReadAnalysis || !Array.isArray(quickReadAnalysis.tickers)) return { watchlist: [], others: [] };
    const watchlistStr = localStorage.getItem('watchlist_tickers') || 'AAPL, MSFT, GOOGL, NVDA, TSLA, AMD, META, NFLX, AMZN, AVGO';
    const watchlistSet = new Set(watchlistStr.split(',').map(t => t.trim().toUpperCase()).filter(Boolean));

    const watchlistImpacts: any[] = [];
    const otherImpacts: any[] = [];

    quickReadAnalysis.tickers.forEach((t: any) => {
      const symbol = (t.symbol || t.ticker || '').toUpperCase();
      if (symbol) {
        const item = { ...t, symbol };
        if (watchlistSet.has(symbol)) {
          watchlistImpacts.push(item);
        } else {
          otherImpacts.push(item);
        }
      }
    });

    return { watchlist: watchlistImpacts, others: otherImpacts };
  };

  // AI Sentiment Score and Ranking Pipeline
  const runAiSentimentRating = async (rawArticles: StagedNewsItem[]) => {
    setLoadingRating(true);
    try {
      const response = await fetch('/api/rate-rank-headlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsArticles: rawArticles })
      });
      if (!response.ok) {
        throw new Error(`Sentiment service responded with status ${response.status}`);
      }
      const raw = await response.json();
      if (raw.success && raw.ratedArticles) {
        setStagedData(prev => prev ? {
          ...prev,
          newsArticles: raw.ratedArticles
        } : null);

        // Pre-select top 10 articles by default when ratings complete
        const scoredSorted = [...raw.ratedArticles].sort((a, b) => (b.score || 0) - (a.score || 0));
        const top10 = scoredSorted.slice(0, 10);
        setSelectedArticles(top10);
      }
    } catch (err: any) {
      console.warn("AI score pipeline failed, falling back to raw items:", err.message);
    } finally {
      setLoadingRating(false);
    }
  };

  // Fetch / Download Raw Sources payload for Staging view
  const triggerHarvest = async () => {
    setLoadingHarvest(true);
    setHarvestError(null);
    setStagedData(null);
    setGeneratedReport(null);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/harvest-staged-data');
      if (!res.ok) {
        throw new Error(`Harvest failed with HTTP status ${res.status}`);
      }
      const data: StagedDataPayload = await res.json();
      if (!data.success) {
        throw new Error(data.timestamp ? "Engine failed to stage financial quotes" : "Invalid response envelope");
      }
      setStagedData(data);
      // Pre-select indices to make curation simple
      setSelectedIndices(data.marketData.map(d => d.ticker));
      
      // Instantly run AI scoring & rating on the raw feed articles in background!
      await runAiSentimentRating(data.newsArticles);
    } catch (err: any) {
      console.error(err);
      setHarvestError(err.message || 'An unexpected error occurred during harvesting.');
    } finally {
      setLoadingHarvest(false);
    }
  };

  // Toggle article selection
  const toggleArticle = (art: StagedNewsItem) => {
    const exists = selectedArticles.some(a => a.link === art.link);
    if (exists) {
      setSelectedArticles(selectedArticles.filter(a => a.link !== art.link));
    } else {
      setSelectedArticles([...selectedArticles, art]);
    }
  };

  // Toggle index selection
  const toggleIndex = (ticker: string) => {
    if (selectedIndices.includes(ticker)) {
      setSelectedIndices(selectedIndices.filter(t => t !== ticker));
    } else {
      setSelectedIndices([...selectedIndices, ticker]);
    }
  };

  // Select/Deselect All helper
  const selectAllArticles = (select: boolean) => {
    if (stagedData) {
      setSelectedArticles(select ? stagedData.newsArticles : []);
    }
  };

  // Auto Select top 10 scored headlines helper
  const selectTop10ScoredArticles = () => {
    if (!stagedData) return;
    const sorted = [...stagedData.newsArticles].sort((a, b) => (b.score || 0) - (a.score || 0));
    setSelectedArticles(sorted.slice(0, 10));
  };

  // Synthesis Execution Flow
  const triggerSynthesisOutput = async () => {
    if (!stagedData) return;
    setLoadingSynthesis(true);
    setSynthesisError(null);
    setGeneratedReport(null);
    setSaveStatus('idle');
    setSynthesisLogs([
      "Spinning up decoupled neural pipeline...",
      "Resolving selected macroeconomic indicators...",
      `Filtering selected curated sources (Active articles: ${selectedArticles.length})`
    ]);

    const timer = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      await timer(500);
      setSynthesisLogs(prev => [...prev, "Staged raw datasets loaded successfully."]);
      
      const filteredMarket = stagedData.marketData.filter(m => selectedIndices.includes(m.ticker));
      
      setSynthesisLogs(prev => [...prev, "Transmitting high-impact headlines to Gemini. Aligning Level-1 & Level-2 implication matrices..."]);
      await timer(500);

      const response = await fetch('/api/generate-staged-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedArticles: selectedArticles,
          marketData: filteredMarket,
          userIntent: userIntent.trim()
        })
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error("Missing AI credential context. Please configure GEMINI_API_KEY.");
        }
        throw new Error(`Inference pipeline responded with status code ${response.status}`);
      }

      const rawResult = await response.json();
      if (!rawResult.success || !rawResult.report) {
        throw new Error("Fidelity compilation failed: Report schema error");
      }

      setSynthesisLogs(prev => [...prev, "Successfully received structured JSON output.", "Validating granular level thesis alignment...", "Fidelity Report compiled successfully!"]);
      const enriched = {
        ...rawResult.report,
        marketData: filteredMarket
      };
      setGeneratedReport(enriched);
    } catch (err: any) {
      console.error(err);
      setSynthesisError(err.message || 'An error occurred during report generation.');
    } finally {
      setLoadingSynthesis(false);
    }
  };

  // Save report into Firestore collection `daily_news_logs`
  const saveToChronology = async () => {
    if (!currentUser) {
      setSaveError("User session expired. Please access terminal to sign in.");
      setSaveStatus('error');
      return;
    }
    if (!generatedReport) return;

    setSaveStatus('saving');
    setSaveError(null);

    try {
      // Build exactly a complete compliant DailyNewsLog record with precise chronological tags
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedTimestampStamp = `${yyyy}-${mm}-${dd} · ${hours}:${minutes}${ampm} ET (Staged Compile)`;

      const dateStr = generatedReport.reportDate || `${yyyy}-${mm}-${dd}`;
      const reportPayload = {
        userId: currentUser.uid,
        reportDate: dateStr,
        reportTimestamp: formattedTimestampStamp,
        title: generatedReport.title || "Custom Staged Analysis Report",
        macroRegime: generatedReport.macroRegime || "UNCLASSIFIED",
        macroLede: generatedReport.macroLede || "",
        macroEvents: generatedReport.macroEvents || [],
        macroTextLines: generatedReport.macroTextLines || [],
        actionSummary: generatedReport.actionSummary || null,
        insiderStats: generatedReport.insiderStats || [],
        insiderTables: generatedReport.insiderTables || [],
        newsDetailedAnalyses: generatedReport.newsDetailedAnalyses || [], // Stored inside database to persist top 10 reports beautifully!
        marketData: generatedReport.marketData || [], // Persist macro indicator metrics
        generatedUtc: new Date().toISOString(),
        timestamp: serverTimestamp(), // Standard server timestamp compliant with Firestore security rules
      };

      await addDoc(collection(db, "daily_news_logs"), reportPayload);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error("Firestore save error:", err);
      setSaveError(err.message || "Failed to commit log to Firebase Firestore.");
      setSaveStatus('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6" id="harvest-workflow-container">
      {/* Tab Header with institutional styled captions */}
      <div className="flex flex-col gap-2" id="harvest-workflow-header">
        <h3 className="text-xl font-display font-black uppercase tracking-tighter text-[#eaeefe] text-left flex items-center gap-2">
          <Workflow className="w-5 h-5 text-indigo-500" />
          Staged Report Builder
        </h3>
        <p className="text-[10px] text-bento-muted font-bold tracking-widest text-left uppercase">
          Download Staged Macro Dumps &amp; Custom Guide Gemini Compiler &bull; Zero Token Bloat 
        </p>
      </div>

      {/* Main Multi-Stage split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="harvest-workflow-body">
        
        {/* LEFT COLUMN: The Harvesting, Curation, and Compilation control board */}
        <div className="lg:col-span-6 space-y-6 flex flex-col">
          
          {/* STEP 1 PANEL: Downloader & Raw Staging */}
          <div className="bg-[#121626]/80 border border-[#243056] rounded-xl p-5 flex flex-col space-y-4" id="step-1-card">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-black tracking-widest text-indigo-400 uppercase font-mono mb-1">STAGE 01 &bull; HARVEST LIVE CHANNELS</span>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Download &amp; Stage Dump</h4>
              </div>
              <div className="bg-[#1b213b] border border-[#2d3a68] text-xs font-mono px-2 py-0.5 rounded text-indigo-300">
                STAGED_RAW
              </div>
            </div>

            <p className="text-xs text-[#cfd8ff]/80 font-normal leading-relaxed text-left">
              Triggers our server scrapers to harvest financial indexes, bond yields, macro indicators, and breaking economic news RSS channels, caching them locally before AI interaction.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                id="btn-harvest"
                onClick={triggerHarvest}
                disabled={loadingHarvest}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 text-white text-[10px] uppercase tracking-widest font-bold px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 shadow-lg disabled:cursor-not-allowed cursor-pointer"
              >
                {loadingHarvest ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Downloading Sources...
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    Harvest Raw Sources
                  </>
                )}
              </button>

              {stagedData && (
                <button
                  id="btn-reveal-dump"
                  onClick={() => setRevealDump(!revealDump)}
                  className="bg-[#181f3d] hover:bg-[#202952] text-[#cfd8ff] border border-[#2d3a68] text-[9px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-lg transition-all"
                >
                  {revealDump ? "Hide Staged payload" : "Inspect Raw staged dump"}
                </button>
              )}
            </div>

            {harvestError && (
              <div className="bg-red-950/40 border border-red-800 text-red-200 p-3 rounded-lg flex items-start gap-2.5" id="harvest-error-box">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-xs font-bold uppercase tracking-wider">Scraping Interrupted</p>
                  <p className="text-[11px] text-red-300/90 mt-0.5 leading-relaxed">{harvestError}</p>
                </div>
              </div>
            )}

            {/* Display the raw datadump code block visually block */}
            {stagedData && revealDump && (
              <div className="space-y-2 mt-2" id="staged-dump-container">
                <div className="flex items-center justify-between bg-[#080b14] border border-[#1b2342] px-3 py-1.5 rounded-t text-[10px] font-mono text-[#8a9cf2]">
                  <span>staged_feed_payload.json &bull; {(JSON.stringify(stagedData).length / 1024).toFixed(1)} KB</span>
                  <span className="text-[#5164bc]">READ ONLY</span>
                </div>
                <pre className="text-[10px] font-mono p-3 bg-black/90 border-x border-b border-[#1b2342] text-green-400/90 overflow-x-auto rounded-b max-h-56 text-left whitespace-pre">
                  {JSON.stringify(stagedData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* STEP 2 PANEL: Interactive Curation & User Intent Selection */}
          {stagedData && (
            <div className="bg-[#121626]/80 border border-[#243056] rounded-xl p-5 flex flex-col space-y-4" id="step-2-card">
              <div className="flex flex-col">
                <span className="text-[9px] font-black tracking-widest text-[#f5b21a] uppercase font-mono mb-1">STAGE 02 &bull; COMPUTE BOUNDARY</span>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Curation &amp; Macro Directives</h4>
              </div>

              <p className="text-xs text-[#cfd8ff]/80 leading-relaxed text-left">
                Keep the payload size small to safeguard your token quotas. Check or uncheck indicators and headline cards to control which raw pieces the AI will evaluate.
              </p>

              {/* Macro Indicators Selectors */}
              <div className="space-y-2" id="indicators-curator-box">
                <span className="text-[9px] font-bold uppercase text-[#cfd8ff]/70 tracking-widest font-mono">1. Select Staged Indicators ({selectedIndices.length} / {stagedData.marketData.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {stagedData.marketData.map((item) => {
                    const isSelected = selectedIndices.includes(item.ticker);
                    const isPos = item.change && item.change >= 0;
                    return (
                      <button
                        key={item.ticker}
                        onClick={() => toggleIndex(item.ticker)}
                        className={`px-2.5 py-1.5 rounded border text-[10px] font-mono flex items-center gap-1.5 transition-all text-left ${
                          isSelected 
                            ? 'bg-[#1e274c] border-indigo-500 text-white' 
                            : 'bg-[#0b0e1a]/80 border-transparent text-[#7d8bbd] hover:border-[#1e274c]'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${isSelected ? (isPos ? 'bg-green-500' : 'bg-red-500') : 'bg-gray-700'}`} />
                        <span>{item.ticker}</span>
                        {item.price && (
                          <span className="text-white/60">({item.price.toFixed(1)})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Breaking Articles checklist */}
              <div className="space-y-2.5" id="articles-curator-box">
                <div className="flex items-center justify-between bg-[#191f3a]/40 px-3 py-1.5 rounded border border-[#243056]/50">
                  <span className="text-[9px] font-bold uppercase text-[#cfd8ff]/70 tracking-widest font-mono">2. Select News Sources ({selectedArticles.length} / {stagedData.newsArticles.length})</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => selectAllArticles(true)} 
                      className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider hover:text-indigo-300"
                    >
                      ALL
                    </button>
                    <span className="text-gray-600 text-[10px]">|</span>
                    <button 
                      onClick={() => selectAllArticles(false)} 
                      className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider hover:text-indigo-300"
                    >
                      NONE
                    </button>
                  </div>
                </div>

                {/* News Source Channels Interactive filter tabs */}
                <div className="flex flex-wrap gap-1.5 bg-[#0b0e1a]/80 p-1.5 rounded-lg border border-[#1b2342] mb-1">
                  {['ALL', 'WSJ', 'Reuters', 'Bloomberg', 'CNBC', 'Financial Times', 'Yahoo'].map((src) => {
                    const isActive = newsSourceFilter === src;
                    // Count available articles for this filter
                    const count = stagedData.newsArticles.filter(art => {
                      if (src === 'ALL') return true;
                      if (src === 'WSJ') return art.source?.startsWith('WSJ');
                      if (src === 'Reuters') return art.source?.toLowerCase().includes('reuters');
                      if (src === 'Bloomberg') return art.source?.toLowerCase().includes('bloomberg');
                      if (src === 'CNBC') return art.source?.toLowerCase().includes('cnbc');
                      if (src === 'Financial Times') return art.source?.toLowerCase().includes('financial');
                      if (src === 'Yahoo') return art.source?.toLowerCase().includes('yahoo');
                      return true;
                    }).length;

                    return (
                      <button
                        key={src}
                        onClick={() => setNewsSourceFilter(src)}
                        className={`text-[9px] font-black uppercase font-mono px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 ${
                          isActive 
                            ? 'bg-indigo-600 text-white shadow-inner' 
                            : 'text-[#7d8bbd] hover:text-[#cfd8ff] hover:bg-[#181f3d]'
                        }`}
                      >
                        <span>{src}</span>
                        <span className={`text-[8px] font-bold ${isActive ? 'text-white/60' : 'text-[#5164bc]'}`}>({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick AI Score & Filtering Actions */}
                <div className="flex items-center justify-between gap-3 bg-[#0f1324] border border-[#243056]/60 p-2 rounded-lg" id="ai-ranking-actions-bar">
                  <button
                    onClick={selectTop10ScoredArticles}
                    className="bg-[#243056]/80 hover:bg-[#2e3e70] text-[#eaeefe] text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded border border-[#2d3a68] flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                    title="Filter and keep the top 10 highest-impact scored documents based on AI rankings."
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#f5b21a] animate-pulse" />
                    <span>⚡ Pick Top 10 Headlines</span>
                  </button>

                  <button
                    onClick={() => runAiSentimentRating(stagedData.newsArticles)}
                    disabled={loadingRating}
                    className="text-[#9eafe5] hover:text-white bg-[#0e111d] hover:bg-[#151a2d] font-mono text-[9px] font-bold px-3 py-1.5 rounded uppercase flex items-center gap-1 bg-black/40 border border-slate-800 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {loadingRating ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                        <span>Re-Scoring...</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        <span>Re-Run AI Scoring</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5 border border-[#1b2342] p-1.5 rounded bg-black/35 ai-triggerable" id="news-harvest-list">
                  {stagedData.newsArticles
                    .filter((art) => {
                      if (newsSourceFilter === 'ALL') return true;
                      if (newsSourceFilter === 'WSJ') return art.source?.startsWith('WSJ');
                      if (newsSourceFilter === 'Reuters') return art.source?.toLowerCase().includes('reuters');
                      if (newsSourceFilter === 'Bloomberg') return art.source?.toLowerCase().includes('bloomberg');
                      if (newsSourceFilter === 'CNBC') return art.source?.toLowerCase().includes('cnbc');
                      if (newsSourceFilter === 'Financial Times') return art.source?.toLowerCase().includes('financial');
                      if (newsSourceFilter === 'Yahoo') return art.source?.toLowerCase().includes('yahoo');
                      return true;
                    })
                    .map((art) => {
                      const isChecked = selectedArticles.some(a => a.link === art.link);
                      
                      const getSourceColorStyle = (srcName?: string) => {
                        const name = (srcName || '').toLowerCase();
                        if (name.includes('wsj')) return 'bg-red-950/60 text-red-300 border border-red-900/30';
                        if (name.includes('reuters')) return 'bg-amber-955/20 text-amber-300 border border-amber-900/30';
                        if (name.includes('bloomberg')) return 'bg-blue-950/60 text-blue-300 border border-blue-900/30';
                        if (name.includes('cnbc')) return 'bg-emerald-950/60 text-emerald-300 border border-emerald-900/30';
                        if (name.includes('financial')) return 'bg-rose-955/20 text-rose-300 border border-rose-900/30';
                        if (name.includes('yahoo')) return 'bg-purple-950/60 text-purple-300 border border-purple-900/30';
                        return 'bg-slate-900/80 text-slate-300 border border-slate-800';
                      };

                      const getScoreColorStyle = (score?: number) => {
                        if (score === undefined) return '';
                        if (score >= 8) return 'bg-red-955/40 text-red-400 border border-red-800/60';
                        if (score >= 5) return 'bg-amber-955/40 text-amber-400 border border-amber-800/60';
                        return 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/60';
                      };

                      return (
                        <div 
                          key={art.link}
                          onClick={() => toggleArticle(art)}
                          className={`p-2.5 rounded-lg border transition-all text-left cursor-pointer flex gap-3 items-start ${
                            isChecked 
                              ? 'bg-[#1b213b]/60 border-indigo-500/50 hover:bg-[#1f2746]/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' 
                              : 'bg-[#080b14]/50 border-transparent text-[#7d8bbd]'
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Swapped via parent click
                            className="mt-1 rounded border-indigo-900 bg-black text-indigo-600 accent-indigo-500 cursor-pointer shrink-0"
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              {art.source && (
                                <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shadow-sm border ${getSourceColorStyle(art.source)}`}>
                                  {art.source}
                                </span>
                              )}
                              
                              {/* AI Rating Indicators */}
                              {art.score !== undefined && (
                                <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-sm border font-mono ${getScoreColorStyle(art.score)}`}>
                                  ⭐ {art.score}/10
                                </span>
                              )}

                              {art.subject && (
                                <span className="text-[8px] font-bold bg-indigo-950/70 text-indigo-300 border border-indigo-900/40 px-1.5 py-0.5 rounded uppercase">
                                  {art.subject}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickReadArticle(art);
                                }}
                                className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 hover:bg-indigo-600/30 active:scale-95 border border-indigo-500/30 hover:border-indigo-400 text-[8px] font-black uppercase tracking-wider text-[#a5b4fc] hover:text-white rounded transition-all cursor-pointer"
                                title="Run Knowledge Assist & Watchlist impact analysis"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                                <span>Assist</span>
                              </button>

                              {art.pubDate && (
                                <span className="text-[8px] text-indigo-400/80 font-mono ml-1">
                                  {new Date(art.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>

                            <h5 className={`text-[11px] font-bold leading-snug tracking-normal ${isChecked ? 'text-white' : 'text-[#7d8bbd]'}`}>
                              {art.title}
                            </h5>

                            {art.twoWordAssessment && (
                              <p className="text-[9px] text-[#ecc94b] font-mono uppercase tracking-wide font-bold mt-1">
                                Assessment: {art.twoWordAssessment}
                              </p>
                            )}

                            {isChecked && art.contentSnippet && (
                              <p className="text-[10px] text-[#cfd8ff]/75 font-normal mt-1 leading-relaxed line-clamp-2">
                                {art.contentSnippet}
                              </p>
                            )}

                            {isChecked && art.oneLineJustification && (
                              <div className="mt-1.5 p-1.5 bg-[#0a0d18] border border-[#243056]/30 rounded text-[9px] font-normal leading-normal text-indigo-300 italic">
                                <span className="font-bold text-[#f5b21a] not-italic mr-1">AI Reason:</span>
                                "{art.oneLineJustification}"
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* HEADLINE INTELLIGENCE & WATCHLIST IMPACT ANALYZER BOARD */}
              {quickReadArticle && (
                <div 
                  id="headline-intelligence-board"
                  className="bg-[#0b0c16] border border-indigo-500/40 rounded-xl p-4.5 space-y-4 text-left shadow-2xl transition-all"
                >
                  {/* Title Header with X button */}
                  <div className="flex items-center justify-between border-b border-[#1f2952] pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                      <h4 className="text-xs font-black uppercase text-white tracking-widest font-mono">
                        📖 HEADLINE KNOWLEDGE ASSIST
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickReadArticle(null);
                        setQuickReadAnalysis(null);
                        setQuickReadError(null);
                      }}
                      className="text-[#7d8bbd] hover:text-white p-1 hover:bg-[#11162d] rounded transition-all cursor-pointer"
                      title="Close Analyzer Panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Loading State */}
                  {loadingQuickRead && (
                    <div className="py-6 flex flex-col items-center justify-center space-y-3 font-mono text-[11px] text-[#8a9cf2]">
                      <Loader2 className="w-6 h-6 animate-spin text-[#ecc94b]" />
                      <div className="space-y-1 text-center max-w-md">
                        <p className="font-bold text-white animate-pulse">DISTILLING NARRATIVE &amp; RIPPLES...</p>
                        <p className="text-[10px] text-indigo-400">Knowledge Assist is mapping multi-level ecosystems, tracing secular timelines, and scanning your watchlist tickers for system risks...</p>
                      </div>
                    </div>
                  )}

                  {/* Error State */}
                  {quickReadError && (
                    <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg flex items-start gap-2 text-[11px] text-red-200">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-black uppercase tracking-wider text-red-300">Analysis Failed</p>
                        <p className="mt-0.5 text-red-300/80 leading-relaxed">{quickReadError}</p>
                      </div>
                    </div>
                  )}

                  {/* Fully Loaded Intelligence */}
                  {quickReadAnalysis && (
                    <div className="space-y-4 text-xs animate-fade-in">
                      {/* Active headline focus */}
                      <div className="bg-[#121626] border border-indigo-950 p-3 rounded-lg">
                        <span className="text-[9px] font-bold text-amber-400 font-mono uppercase bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/30">
                          {quickReadAnalysis.category || "General Macro"}
                        </span>
                        <h5 className="text-white text-xs font-black leading-snug mt-1.5 hover:text-indigo-300 transition-colors">
                          <a href={quickReadAnalysis.link} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1.5 flex-wrap">
                            {quickReadAnalysis.headline || quickReadArticle.title}
                            <ArrowUpRight className="w-3 h-3 text-indigo-400" />
                          </a>
                        </h5>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[9px] text-[#7d8bbd] font-mono">
                            Priority rating: <strong className="text-purple-400 font-bold">{quickReadAnalysis.priority || 5}/10</strong>
                          </span>
                        </div>
                      </div>

                      {/* Multi-Level Summaries */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 bg-[#0e111d] border border-blue-950 rounded-lg space-y-1">
                          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest font-mono">Level 1: Direct Cause</p>
                          <p className="text-[10px] text-[#cfd8ff]/85 leading-relaxed font-normal">
                            {quickReadAnalysis.summaries?.level1 || "Analyzing day-one events..."}
                          </p>
                        </div>
                        <div className="p-3 bg-[#0e111d] border border-indigo-950 rounded-lg space-y-1">
                          <p className="text-[9px] font-black text-[#a5b4fc] uppercase tracking-widest font-mono">Level 2: Ecosystem Ripples</p>
                          <p className="text-[10px] text-[#cfd8ff]/85 leading-relaxed font-normal">
                            {quickReadAnalysis.summaries?.level2 || "Mapping nearest suppliers & supply chains..."}
                          </p>
                        </div>
                        <div className="p-3 bg-[#0e111d] border border-purple-950 rounded-lg space-y-1">
                          <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest font-mono">Level 3: Macro &amp; Rates</p>
                          <p className="text-[10px] text-[#cfd8ff]/85 leading-relaxed font-normal">
                            {quickReadAnalysis.summaries?.level3 || "Extrapolating broad fiscal structural impacts..."}
                          </p>
                        </div>
                      </div>

                      {/* Watchlist Correlation Desk */}
                      <div className="bg-[#121424] border border-[#242b4d] rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-indigo-950 pb-1.5">
                          <span className="text-[9px] font-black uppercase text-amber-400 font-mono tracking-widest">
                            🔥 Watchlist &amp; Ticker Impact Evaluation
                          </span>
                          <span className="text-[8px] font-mono text-indigo-400">
                            Custom Stocks Matcher
                          </span>
                        </div>

                        {(() => {
                          const breakdown = getTickersBreakdown();
                          const hasWatchlist = breakdown.watchlist.length > 0;
                          const hasOthers = breakdown.others.length > 0;

                          return (
                            <div className="space-y-2">
                              {/* Watchlist Impact Stocks */}
                              <div>
                                <p className="text-[9px] font-bold uppercase text-gray-400 mb-1.5 font-mono">Your Watchlist Matches ({breakdown.watchlist.length}):</p>
                                {hasWatchlist ? (
                                  <div className="flex flex-wrap gap-2">
                                    {breakdown.watchlist.map((t, idx) => {
                                      const isPos = t.score > 0;
                                      const isNeg = t.score < 0;
                                      const scoreLabel = t.score === 3 ? "Strong Tailwind" 
                                                       : t.score === 2 ? "Tailwind" 
                                                       : t.score === 1 ? "Mild Tailwind" 
                                                       : t.score === -1 ? "Mild Headwind" 
                                                       : t.score === -2 ? "Headwind" 
                                                       : t.score === -3 ? "Strong Headwind" : "Neutral";
                                      return (
                                        <div 
                                          key={idx}
                                          className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-mono text-[10px] ${
                                            isPos 
                                              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                                              : isNeg 
                                                ? 'bg-red-950/40 border-red-500/30 text-red-300' 
                                                : 'bg-[#1b213b] border-indigo-900/40 text-indigo-300'
                                          }`}
                                        >
                                          {isPos ? (
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                          ) : isNeg ? (
                                            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                          ) : (
                                            <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                          )}
                                          <span className="font-bold">{t.symbol}</span>
                                          <span className="text-[9px] px-1 py-0.5 rounded bg-black/40 border border-white/5 font-black uppercase text-white tracking-widest">{scoreLabel} ({t.score > 0 ? `+${t.score}` : t.score})</span>
                                          <span className="text-[8px] text-white/50 lowercase italic">({t.horizonEffect || 'days'})</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-400 italic">No direct watchlist stocks match this headline's narrative. Broad macro sector groupings apply instead.</p>
                                )}
                              </div>

                              {/* Other Impacted Stocks (Hedge Targets) */}
                              {hasOthers && (
                                <div className="pt-1.5 border-t border-[#1a203d]">
                                  <p className="text-[9px] font-bold uppercase text-gray-400 mb-1.5 font-mono">Other Key Market Ecosystem Tickers ({breakdown.others.length}):</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {breakdown.others.map((t, idx) => {
                                      const isPos = t.score > 0;
                                      return (
                                        <span 
                                          key={idx}
                                          className={`px-1.5 py-0.5 rounded border font-mono text-[9px] ${
                                            isPos 
                                              ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' 
                                              : 'bg-red-950/30 border-red-900/40 text-red-400'
                                          }`}
                                        >
                                          <strong>{t.symbol}</strong> ({t.score > 0 ? `+${t.score}` : t.score})
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Side-by-Side Trade Flows (Direct Beneficiaries vs Direct Victims) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Beneficiaries Column */}
                        <div className="bg-[#0b1b16] border border-emerald-900/30 p-3 rounded-lg space-y-1.5 text-left text-emerald-300">
                          <p className="text-[9px] font-black uppercase tracking-widest font-mono text-emerald-400 flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Trade Flow: Sector Beneficiaries</span>
                          </p>
                          {(() => {
                            const b = quickReadAnalysis.beneficiaries;
                            const direct = b?.direct || [];
                            const indirect1 = b?.indirect_level1 || [];
                            const list = [...direct, ...indirect1];
                            if (list.length === 0) return <p className="text-[10px] text-emerald-300/60 italic">No direct gainers mapped.</p>;
                            return (
                              <ul className="space-y-1 text-[10px] divide-y divide-emerald-900/10">
                                {list.map((item: any, idx: number) => (
                                  <li key={idx} className="pt-1 first:pt-0 leading-relaxed font-normal">
                                    <strong className="text-white font-mono">{item.name}</strong>: {item.reason}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </div>

                        {/* Victims Column */}
                        <div className="bg-[#1b0b0f] border border-red-900/30 p-3 rounded-lg space-y-1.5 text-left text-red-300">
                          <p className="text-[9px] font-black uppercase tracking-widest font-mono text-red-400 flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>Trade Flow: Sector Decline Targets</span>
                          </p>
                          {(() => {
                            const v = quickReadAnalysis.victims;
                            const direct = v?.direct || [];
                            const indirect1 = v?.indirect_level1 || [];
                            const list = [...direct, ...indirect1];
                            if (list.length === 0) return <p className="text-[10px] text-red-300/60 italic">No direct decline targets mapped.</p>;
                            return (
                              <ul className="space-y-1 text-[10px] divide-y divide-red-900/10">
                                {list.map((item: any, idx: number) => (
                                  <li key={idx} className="pt-1 first:pt-0 leading-relaxed font-normal">
                                    <strong className="text-white font-mono">{item.name}</strong>: {item.reason}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Timescale Options Horizons */}
                      <div className="p-3 bg-[#0d0e1b] border border-indigo-950 rounded-lg space-y-1.5">
                        <p className="text-[9px] font-black text-[#8a9cf2] uppercase tracking-widest font-mono">Options Horizon Position Guide</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                          <div className="p-2 bg-black/40 rounded border border-white/5 text-left">
                            <span className="text-[9px] font-bold text-indigo-400 font-mono block">DAYS 1-2:</span>
                            <span className="text-[#cfd8ff]/85">{quickReadAnalysis.timeline?.days || "Immediate day-one flow..."}</span>
                          </div>
                          <div className="p-2 bg-black/40 rounded border border-white/5 text-left">
                            <span className="text-[9px] font-bold text-indigo-400 font-mono block">WEEKS 1-3:</span>
                            <span className="text-[#cfd8ff]/85">{quickReadAnalysis.timeline?.weeks || "Near-term options risk..."}</span>
                          </div>
                          <div className="p-2 bg-black/40 rounded border border-white/5 text-left">
                            <span className="text-[9px] font-bold text-indigo-400 font-mono block">MONTHS 1-6:</span>
                            <span className="text-[#cfd8ff]/85">{quickReadAnalysis.timeline?.months || "Medium term Capex..."}</span>
                          </div>
                          <div className="p-2 bg-black/40 rounded border border-white/5 text-left">
                            <span className="text-[9px] font-bold text-indigo-400 font-mono block">SECULAR:</span>
                            <span className="text-[#cfd8ff]/85">{quickReadAnalysis.timeline?.longterm || "Structural market share changes..."}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Directives briefing */}
              <div className="space-y-1.5" id="directives-curator-box">
                <span className="text-[9px] font-bold uppercase text-[#cfd8ff]/70 tracking-widest font-mono">3. Custom Compiler Instructions (Optional Context)</span>
                <textarea
                  id="user-intent-compiler"
                  placeholder="e.g. Focus heavy on high rates pressure, semiconductor industry gains, and technical levels..."
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  className="w-full h-16 bg-black/60 border border-[#243056] rounded-lg p-2.5 text-xs text-white placeholder-[#5164bc] focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* ESTIMATE CARD PRIOR TO INFERENCE */}
              <div className="bg-[#1b1c2b] border border-[#2d3a68] p-3 rounded-lg flex items-center justify-between" id="token-budget-badge">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#f5b21a]" />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase text-white leading-none">Token Efficiency Budget</p>
                    <p className="text-[9px] text-[#91a0d8] font-mono mt-0.5 uppercase">Estimated size: ~1,400 content tokens</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] bg-green-950/50 border border-green-800 text-green-400 font-bold px-2 py-0.5 rounded font-mono">
                    85% SAFE BUDGET
                  </span>
                </div>
              </div>

              {/* Execute compile trigger */}
              <button
                id="btn-synthesize"
                onClick={triggerSynthesisOutput}
                disabled={loadingSynthesis || selectedArticles.length === 0}
                className="w-full bg-[#f5b21a] hover:bg-[#e0a110] disabled:bg-[#f5b21a]/30 text-black text-[10px] font-black uppercase tracking-widest py-3 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {loadingSynthesis ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating Staged Intelligence...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-black" />
                    Synthesize News Report
                  </>
                )}
              </button>

              {synthesisError && (
                <div className="bg-red-950/40 border border-red-800 text-red-200 p-3 rounded-lg flex items-start gap-2.5" id="synthesis-error-box">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-xs font-bold uppercase tracking-wider">Inference Failed</p>
                    <p className="text-[11px] text-red-300/90 mt-0.5 leading-relaxed">{synthesisError}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TELEMETRY ENGINE LOGS */}
          {loadingSynthesis && (
            <div className="bg-black/80 border border-indigo-950 rounded-xl p-4 font-mono text-[10px]" id="synthesis-logs-terminal">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-950/50 text-indigo-400">
                <span>STAGED_COMPILER_RECONSTRUCT.LOG</span>
                <span className="animate-pulse">● LIVE SPEEDWAY</span>
              </div>
              <div className="space-y-1 text-left text-green-300">
                {synthesisLogs.map((log, lIdx) => (
                  <p key={lIdx} className="leading-relaxed">
                    <span className="text-[#5164bc] mr-1.5">[SYS]</span> {log}
                  </p>
                ))}
                <p className="text-[#f5b21a] animate-pulse">Running neural distillation and schema alignment...</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Real-time high-fidelity document viewer */}
        <div className="lg:col-span-6 flex flex-col">
          {generatedReport ? (
            <div className="space-y-6 flex-1 flex flex-col h-full" id="staged-output-desk">
              
              {/* PUBLISH ACTION CONTROL */}
              <div className="bg-[#121626]/80 border border-[#243056] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" id="save-report-actions">
                <div className="text-left">
                  <p className="text-[9px] font-black uppercase text-green-400 font-mono tracking-widest">COMPILE SUCCESSFUL</p>
                  <p className="text-[11px] text-[#cfd8ff]/85 font-medium mt-0.5">Publish report lock directly to Chronology Archives.</p>
                </div>

                <div className="flex items-center gap-2">
                  {saveStatus === 'saved' ? (
                    <div className="bg-green-950/60 border border-green-800 text-green-400 text-[10px] font-bold px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Saved &amp; Published
                    </div>
                  ) : (
                    <button
                      id="btn-publish-archive"
                      onClick={saveToChronology}
                      disabled={saveStatus === 'saving'}
                      className="bg-[#243056] hover:bg-[#2d3b6b] disabled:bg-indigo-950 text-[#cfd8ff] text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-lg border border-[#2d3a68] transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {saveStatus === 'saving' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Publish to Timeline
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="bg-red-950/40 border border-red-800 text-red-200 p-3 rounded-lg text-left" id="save-error-box">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-400">Publish Error</p>
                  <p className="text-[10px] text-red-300 mt-0.5 leading-relaxed">{saveError}</p>
                </div>
              )}

              {/* REPORT DISPLAY CANVAS */}
              <div className="bg-[#0b0e1a]/85 border border-indigo-950 rounded-xl p-6 flex flex-col space-y-6 text-left ai-triggerable" id="report-distill-canvas">
                
                {/* Header Block */}
                <div className="border-b border-indigo-950 pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <span className="bg-[#1b213b] border border-[#2b396e] text-[#b6c4ff] text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                      STAGED COMPILE REPORT
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#cfd8ff]/70">
                      📅 {generatedReport.reportDate}
                    </span>
                  </div>

                  <h2 className="text-xl font-display font-black text-white tracking-tight uppercase leading-snug mt-3">
                    {generatedReport.title}
                  </h2>

                  {/* Macro Regime identifier */}
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-[9px] font-bold uppercase text-[#7d8bbd] tracking-widest font-mono">REGIME IDENTIFIED:</span>
                    <span className="text-[10px] font-bold uppercase font-mono px-2.5 py-1 rounded bg-amber-950/55 border border-amber-800 text-amber-400">
                      {generatedReport.macroRegime}
                    </span>
                  </div>
                </div>

                {/* GROUNDING MACRO INDICATORS GRID */}
                {generatedReport.marketData && generatedReport.marketData.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">
                      I. GROUNDING MACRO INDICATORS
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {generatedReport.marketData.map((indicator: any, idx: number) => {
                        const changeVal = indicator.change || 0;
                        const pctVal = indicator.changePercent || 0;
                        const isPos = changeVal >= 0;
                        const isNeutral = changeVal === 0;
                        return (
                          <div 
                            key={idx} 
                            className="bg-black/40 border border-[#243056]/50 px-3 py-2.5 rounded-lg flex flex-col justify-between"
                          >
                            <span className="text-[9px] font-bold text-gray-400 uppercase truncate" title={indicator.name || indicator.ticker}>
                              {indicator.name || indicator.ticker}
                            </span>
                            <div className="flex items-baseline justify-between mt-1 gap-1">
                              <span className="text-[11px] font-black font-mono text-white">
                                {indicator.price !== null ? indicator.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A"}
                              </span>
                              {indicator.price !== null && (
                                <span className={`text-[9px] font-bold font-mono ${
                                  isNeutral ? 'text-gray-400' : isPos ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {isPos && !isNeutral ? '+' : ''}{pctVal.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Macro Lede paragraph */}
                <div className="space-y-2">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">II. DISTILLED MACRO LEDE</span>
                  <p className="text-xs text-[#cfd8ff]/90 leading-relaxed font-normal bg-black/35 p-4 rounded-lg border border-[#1b213c]/35">
                    {generatedReport.macroLede}
                  </p>
                </div>

                {/* Macro Timeline Events */}
                {generatedReport.macroEvents && generatedReport.macroEvents.length > 0 && (
                  <div className="space-y-3">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">III. KEY SYNTHESIZED TIMELINE</span>
                    <div className="space-y-2">
                      {generatedReport.macroEvents.map((ev: any, evIdx: number) => (
                        <div key={evIdx} className="p-3 bg-black/45 border-l-2 border-indigo-500 rounded-r-lg border-y border-r border-[#1b2342] flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-[#8c9df2] font-black uppercase">{ev.time || "TIMELESS"}</span>
                            <span className="text-[9px] uppercase font-mono text-[#f5b21a] bg-[#211a10] px-2 py-0.5 rounded border border-[#4a3920]">
                              {ev.impact || "MEDIUM"}
                            </span>
                          </div>
                          <h4 className="text-[11px] font-bold text-white uppercase">{ev.title}</h4>
                          <p className="text-[10px] text-[#cfd8ff]/80 leading-relaxed font-normal mt-0.5">{ev.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Macro Key Bullet lines */}
                {generatedReport.macroTextLines && generatedReport.macroTextLines.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">IV. ANALYTICAL SHIFTS</span>
                    <ul className="list-none space-y-1.5 pl-0.5">
                      {generatedReport.macroTextLines.map((line: string, lineIdx: number) => (
                        <li key={lineIdx} className="text-xs text-[#cfd8ff]/80 flex items-start gap-2">
                          <span className="text-[#8c9df2] mt-1 shrink-0 font-mono font-bold text-[10px]">&bull;</span>
                          <span className="leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tactical Strategy Playbook Columns */}
                {generatedReport.actionSummary?.cols && generatedReport.actionSummary.cols.length > 0 && (
                  <div className="space-y-3">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">V. TACTICAL PLAYBOOK: {generatedReport.actionSummary.title}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {generatedReport.actionSummary.cols.map((col: any, colIdx: number) => {
                        const isWin = col.isWin;
                        return (
                          <div 
                            key={colIdx} 
                            className={`p-4 rounded-xl border flex flex-col space-y-2.5 ${
                              isWin 
                                ? 'bg-green-950/20 border-green-900/50' 
                                : 'bg-red-950/15 border-red-900/35'
                            }`}
                          >
                            <span className={`text-[9px] font-black tracking-widest uppercase font-mono ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                              {col.title}
                            </span>
                            <ul className="space-y-1.5 font-normal">
                              {col.items.map((it: string, itIdx: number) => (
                                <li key={itIdx} className={`text-[11px] leading-relaxed flex items-start gap-1.5 ${isWin ? 'text-green-200/90' : 'text-red-200/90'}`}>
                                  {isWin ? <TrendingUp className="w-3 h-3 text-green-500 shrink-0 mt-0.5" /> : <TrendingDown className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />}
                                  <span>{it}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* News Detailed Analytica & Implications Stage */}
                {generatedReport.newsDetailedAnalyses && generatedReport.newsDetailedAnalyses.length > 0 && (
                  <div className="space-y-5 pt-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">
                      V. GRANULAR HEADLINE IMPLICATIONS &amp; TICKERS MATRIX
                    </span>
                    
                    <div className="space-y-4">
                      {generatedReport.newsDetailedAnalyses.map((item: any, idx: number) => (
                        <div key={idx} className="bg-black/45 border border-[#1b2342] rounded-xl p-4 space-y-3.5 text-left">
                          
                          {/* Item header with source and classified subject */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243056]/30 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-mono uppercase bg-[#181f3d] border border-[#2d3a68] px-2 py-0.5 rounded text-indigo-300">
                                {item.source || "Breaking Feed"}
                              </span>
                              <span className="text-[9px] font-bold text-[#ecc94b] bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/20 uppercase tracking-wide">
                                {item.subject || "Macro"}
                              </span>
                            </div>
                          </div>

                          <h4 className="text-xs font-black text-white leading-snug">
                            {item.title}
                          </h4>

                          {/* Line implication banner */}
                          {item.implicationLine && (
                            <div className="bg-[#121935]/60 border-l-2 border-indigo-500 p-2.5 rounded text-[11px] font-medium text-indigo-200 leading-relaxed">
                              <span className="font-bold text-white mr-1">Implication:</span>
                              {item.implicationLine}
                            </div>
                          )}

                          {/* Level 1 & Level 2 Implications Row */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            <div className="bg-black/30 border border-[#243056]/40 p-3 rounded-lg flex flex-col space-y-1">
                              <span className="text-[9px] font-black tracking-wider text-indigo-400 font-mono uppercase">Level 1 Direct (Short-Term)</span>
                              <p className="text-[10px] text-[#cfd8ff]/85 leading-relaxed">{item.level1Implication}</p>
                            </div>
                            <div className="bg-black/30 border border-[#243056]/40 p-3 rounded-lg flex flex-col space-y-1">
                              <span className="text-[9px] font-black tracking-wider text-[#ecc94b] font-mono uppercase">Level 2 Indirect (Downstream)</span>
                              <p className="text-[10px] text-[#cfd8ff]/85 leading-relaxed">{item.level2Implication}</p>
                            </div>
                          </div>

                          {/* Beneficial & Detrimental/Opposite Tickers lists */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                            {/* Beneficiary Tickers */}
                            <div className="bg-green-950/10 border border-green-900/30 p-3 rounded-lg space-y-2">
                              <div className="flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-[9px] font-black text-green-400 tracking-wider uppercase font-mono">Beneficial tickers</span>
                              </div>
                              {item.beneficiaryTickers && item.beneficiaryTickers.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.beneficiaryTickers.map((t: any, tIdx: number) => (
                                    <div key={tIdx} className="text-[10px] leading-normal">
                                      <div className="flex items-center gap-1.5">
                                        <span className="bg-green-950 text-green-400 border border-green-800 text-[10px] font-black px-1.5 py-0.2 rounded font-mono uppercase">
                                          {t.ticker}
                                        </span>
                                        <span className="text-white/60 font-bold truncate text-[9px]">{t.name}</span>
                                      </div>
                                      <p className="text-green-200/70 text-[9px] mt-0.5 pl-1.5 leading-relaxed border-l border-green-900/40">
                                        {t.rationale}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[9px] text-green-500/55 italic">No explicit bullish tickers mapped.</p>
                              )}
                            </div>

                            {/* Detrimental/Opposite Tickers */}
                            <div className="bg-red-950/10 border border-red-900/20 p-3 rounded-lg space-y-2">
                              <div className="flex items-center gap-1">
                                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-[9px] font-black text-red-400 tracking-wider uppercase font-mono">Opposite Tech/Macro Detrimentals</span>
                              </div>
                              {item.detrimentalTickers && item.detrimentalTickers.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.detrimentalTickers.map((t: any, tIdx: number) => (
                                    <div key={tIdx} className="text-[10px] leading-normal">
                                      <div className="flex items-center gap-1.5">
                                        <span className="bg-red-950 text-red-400 border border-red-900 text-[10px] font-black px-1.5 py-0.2 rounded font-mono uppercase">
                                          {t.ticker}
                                        </span>
                                        <span className="text-white/60 font-bold truncate text-[9px]">{t.name}</span>
                                      </div>
                                      <p className="text-red-200/70 text-[9px] mt-0.5 pl-1.5 leading-relaxed border-l border-red-900/30">
                                        {t.rationale}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[9px] text-red-500/50 italic">No explicit bearish opposite tickers mapped.</p>
                              )}
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Insider Transactions table */}
                {generatedReport.insiderTables && generatedReport.insiderTables.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#cfd8ff]/70 font-mono">VI. RECONSTRUCTED INSIDER FLOWS</span>
                    <div className="overflow-x-auto border border-indigo-950 rounded">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-indigo-950/30 border-b border-indigo-950 uppercase font-mono text-[9px] text-[#7d8bbd]">
                            <th className="p-2 py-1.5">Ticker</th>
                            <th className="p-2 py-1.5">Entity</th>
                            <th className="p-2 py-1.5">Shares</th>
                            <th className="p-2 py-1.5 text-right">Value</th>
                            <th className="p-2 py-1.5 text-center">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generatedReport.insiderTables.map((row: any, rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-white/5 border-b border-indigo-950/30 text-white/90">
                              <td className="p-2 font-bold text-indigo-400 font-mono uppercase">{row.ticker}</td>
                              <td className="p-2 truncate max-w-28" title={row.insider}>{row.insider} <span className="text-[9px] text-[#7d8bbd]">({row.relationship})</span></td>
                              <td className="p-2 font-mono text-[#cfd8ff]/80">{(row.shares || 0).toLocaleString()}</td>
                              <td className="p-2 font-mono text-right font-medium">
                                ${((row.value || 0).toLocaleString())}
                              </td>
                              <td className="p-2 text-center">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${row.type?.toLowerCase() === 'buy' ? 'bg-green-950 text-green-400 border border-green-900' : 'bg-red-950 text-red-400 border border-red-900'}`}>
                                  {row.type}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* EMPTY READING DESK PLACEHOLDER */
            <div className="bg-[#121626]/40 border border-[#243056]/40 rounded-xl p-12 flex-1 flex flex-col items-center justify-center space-y-4" id="empty-staged-output-view">
              <div className="w-12 h-12 rounded-full bg-[#1b213d] flex items-center justify-center text-[#5164bc]">
                <Cpu className="w-5 h-5 animate-pulse text-indigo-400" />
              </div>
              <div className="text-center max-w-sm space-y-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Empty Reading Desk</h4>
                <p className="text-xs text-bento-muted leading-relaxed">
                  Staged news compilation occurs after triggering the initial harvest dump, followed eventually by Gemini-3.5 synthesis on the curated indices and articles selected on the left.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
