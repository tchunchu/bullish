import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { UploadedHtmlReport } from '../types';
import { parseReportData } from './reportParser';

// Simple class utility 
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

interface BeautifulNewsReaderProps {
  report: UploadedHtmlReport;
  triggerInstantAiInquiry: (prompt: string) => void;
  styleClass?: string;
}

export function BeautifulNewsReader({ report, triggerInstantAiInquiry, styleClass = "" }: BeautifulNewsReaderProps) {
  const parsed = parseReportData(report.htmlContent);
  const activeDate = report.reportDate;
  const reportType = report.reportType === "current" ? "Daily News" : "Scoreboard";

  if (!parsed) {
    // Elegant Text fallback reader
    return (
      <div className={cn("p-6 bg-[#080d1a] hover:bg-[#0b1020] border border-[#243056] rounded-2xl space-y-4 text-left shadow-lg overflow-auto max-h-[700px] ai-triggerable", styleClass)}>
        <h4 className="text-white text-md font-bold uppercase tracking-wider border-b border-bento-border pb-2">
          {report.title}
        </h4>
        <pre className="text-xs text-[#cfd8ff] whitespace-pre-line font-medium leading-relaxed font-mono bg-black/40 p-4 rounded-xl border border-white/5">
          {report.plainText}
        </pre>
      </div>
    );
  }

  return (
    <div className={cn("w-full bg-[#080d1a] border border-[#243056] rounded-2xl p-4 md:p-6 text-left space-y-6 select-text max-h-[750px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 shadow-lg ai-triggerable", styleClass)}>
      {/* Header Banner */}
      <div className="border-b border-[#243056] pb-4">
        <h2 className="text-lg md:text-xl font-black text-white leading-tight font-display tracking-tight">
          {parsed.title}
        </h2>
        {parsed.sub && (
          <p className="text-xs text-amber-300 font-mono font-bold mt-1 uppercase tracking-wide">
            ✨ {parsed.sub}
          </p>
        )}
      </div>

      {/* Mood Grid Block */}
      {parsed.moodItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase font-black tracking-widest text-[#cfd8ff] opacity-60">
            🎯 REAL-TIME SENTIMENT INDICES (Click cell to Ask AI)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {parsed.moodItems.map((cell, cIdx) => (
              <div 
                key={cIdx} 
                onClick={() => triggerInstantAiInquiry(`Analyze the "${cell.k}" sentiment index from the report on ${activeDate} which displays a reading of ${cell.v} (${cell.d}). What factors or news led to this level of index sentiment?`)}
                className="bg-black/30 border border-[#243056] p-3 rounded-xl flex flex-col justify-between shadow-sm cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all group relative"
                title="Click to ask AI about this index value"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase truncate">{cell.k}</span>
                  <Sparkles className="w-2.5 h-2.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xs font-black text-white font-mono">{cell.v}</span>
                  <span className={cn(
                    "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                    cell.isPos && "bg-emerald-500/10 text-emerald-400",
                    cell.isNeg && "bg-red-500/10 text-red-400",
                    cell.isNeu && "bg-white/5 text-gray-400"
                  )}>
                    {cell.d}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Line — Who Wins Today Section in Top */}
      {parsed.bottomLineData && (
        <div className="space-y-4 bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-2xl">
          <div className="flex items-center gap-2 border-b border-[#243056] pb-2">
            <span className="text-xs font-black text-white uppercase tracking-widest">🏆 BOTTOM LINE — WHO WINS TODAY (Click to Ask AI)</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Winners */}
            {parsed.bottomLineData.winners.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-emerald-500/10">
                  <span>🚀</span> Top Winners
                </h5>
                <ol className="space-y-2 text-xs text-[#cfd8ff]">
                  {parsed.bottomLineData.winners.map((win: any, idx: number) => (
                    <li 
                      key={idx}
                      onClick={() => triggerInstantAiInquiry(`In the Bottom Line section under Winners: Please elaborate on this point: "${win.text}". Why are they winners today?`)}
                      className="flex items-start gap-2 bg-black/20 border border-[#243056]/30 p-2.5 rounded-xl hover:border-emerald-500/50 hover:bg-[#153434]/10 transition-all cursor-pointer group"
                    >
                      <span className="text-xs shrink-0">{win.medal || "🥇"}</span>
                      <div className="space-y-0.5">
                        <span className="text-[#e2e8f0] font-medium leading-relaxed group-hover:text-emerald-300 transition-colors" dangerouslySetInnerHTML={{ __html: win.html }} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Biggest Losers */}
            {parsed.bottomLineData.losers.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-red-500/10">
                  <span>⚠️</span> Biggest Losers
                </h5>
                <ol className="space-y-2 text-xs text-[#cfd8ff]">
                  {parsed.bottomLineData.losers.map((lose: any, idx: number) => (
                    <li 
                      key={idx}
                      onClick={() => triggerInstantAiInquiry(`In the Bottom Line section under Losers: Please elaborate on this point: "${lose.text}". Why are they catalogued as declining/at-risk players?`)}
                      className="flex items-start gap-2 bg-black/20 border border-[#243056]/30 p-2.5 rounded-xl hover:border-red-500/50 hover:bg-[#2a1b1b]/10 transition-all cursor-pointer group"
                    >
                      <span className="text-xs shrink-0">{lose.medal || "📉"}</span>
                      <div className="space-y-0.5">
                        <span className="text-[#e2e8f0] font-medium leading-relaxed group-hover:text-red-300 transition-colors" dangerouslySetInnerHTML={{ __html: lose.html }} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Summary Section */}
      {parsed.actionSummaryData && (
        <div className="space-y-3 bg-[#11162d]/40 border border-[#243056] p-4 rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#243056] pb-2">
            <span className="text-xs font-black text-white uppercase tracking-widest">🎯 ACTION SUMMARY MATRIX (Click to Ask AI)</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {parsed.actionSummaryData.cols.map((col: any, idx: number) => (
              <div 
                key={idx}
                className={cn(
                  "p-3 rounded-xl space-y-2 border",
                  col.isWin 
                    ? "bg-[#153434]/15 border-emerald-500/20" 
                    : col.isLose 
                      ? "bg-[#2a1b1b]/20 border-red-500/20" 
                      : "bg-black/20 border-[#243056]"
                )}
              >
                <h5 className={cn(
                  "text-[10px] font-black uppercase tracking-wider",
                  col.isWin ? "text-emerald-400" : col.isLose ? "text-red-400" : "text-[#cfd8ff]"
                )}>
                  {col.title}
                </h5>
                <ul className="space-y-1.5 text-[11px] text-[#cfd8ff] font-medium leading-normal list-disc pl-4 font-mono">
                  {col.items.map((item: string, itemIdx: number) => (
                    <li 
                      key={itemIdx} 
                      onClick={() => triggerInstantAiInquiry(`Discuss the specific action summary points in the "${col.title}" column: "${item}". What is the core reasoning?`)}
                      className="cursor-pointer hover:text-white transition-colors"
                      title="Click to discuss with AI"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insider Cluster Buys Section */}
      {parsed.insidersData && (
        <div className="space-y-4 bg-gradient-to-br from-[#123120]/20 to-black/30 border border-emerald-500/20 p-4 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/15 pb-2">
            <div>
              <h4 className="text-xs font-black text-emerald-400 flex items-center gap-1.5 tracking-wider">
                <span>🟢</span> {parsed.insidersData.title}
              </h4>
              {parsed.insidersData.sub && (
                <p className="text-[10px] text-gray-400 font-medium font-mono mt-0.5">{parsed.insidersData.sub}</p>
              )}
            </div>
            {parsed.insidersData.stats.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-0">
                {parsed.insidersData.stats.map((stat: string, sIdx: number) => (
                  <span key={sIdx} className="bg-black/40 border border-emerald-500/25 px-2 py-0.5 rounded-lg text-[9px] font-mono text-emerald-300 font-bold whitespace-nowrap">
                    {stat}
                  </span>
                ))}
              </div>
            )}
          </div>

          {parsed.insidersData.note && (
            <p className="text-xs text-[#9aa3c7] font-medium leading-relaxed italic border-l-2 border-emerald-500/30 pl-2.5">
              "{parsed.insidersData.note}"
            </p>
          )}

          {parsed.insidersData.tables.map((table: any, tblIdx: number) => (
            <div key={tblIdx} className="space-y-2">
              {table.title && (
                <h5 className="text-[9px] font-bold text-emerald-300 uppercase font-mono tracking-widest">{table.title}</h5>
              )}
              <div className="overflow-x-auto bg-black/20 border border-[#243056]/30 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-indigo-950/40 border-b border-[#243056]/40">
                      {table.headers.map((hdr: string, hIdx: number) => (
                        <th key={hIdx} className="p-2.5 text-[9px] font-bold text-[#cfd8ff]/70 uppercase tracking-wider font-mono">
                          {hdr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((rowItem: any, rIdx: number) => {
                      const row = (rowItem && typeof rowItem === 'object' && 'cells' in rowItem && Array.isArray(rowItem.cells)) ? rowItem.cells : (Array.isArray(rowItem) ? rowItem : []);
                      const rowText = row.map((c: any) => c?.text).filter(Boolean).join(" | ");
                      return (
                        <tr 
                          key={rIdx}
                          onClick={() => {
                            triggerInstantAiInquiry(`In the Insider Cluster Buys section: please analyze this specific transaction row details: [${table.headers.join(" | ")}] -> [${rowText}]. What does this signal for investors?`);
                          }}
                          className="border-b border-[#243056]/10 last:border-0 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                        >
                          {row.map((cell: any, cIdx: number) => (
                            <td 
                              key={cIdx} 
                              className={cn(
                                "p-2.5 font-mono text-[#cfd8ff] font-medium leading-relaxed",
                                cell.isCenter && "text-center",
                                cell.isRight && "text-right",
                                cell.isBold && "font-black text-white"
                              )}
                            >
                              {cell.buyerCount ? (
                                <span className="bg-emerald-500 text-black px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  {cell.buyerCount}
                                </span>
                              ) : cell.links && cell.links.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {cell.links.map((ln: any, lnIdx: number) => (
                                    <a 
                                      key={lnIdx} 
                                      href={ln.href} 
                                      onClick={(e) => e.stopPropagation()} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-indigo-400 hover:underline font-bold text-[10px]"
                                    >
                                      {ln.text}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                cell.text
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {parsed.insidersData.foot && (
            <p className="text-[9px] text-[#9aa3c7] font-medium tracking-wide">{parsed.insidersData.foot}</p>
          )}
        </div>
      )}

      {/* Macro Regime Calendar Section */}
      {(parsed.macroRegime || parsed.macroEvents.length > 0 || parsed.macroLede || (parsed.macroTextLines && parsed.macroTextLines.length > 0)) && (
        <div className="bg-black/20 border border-[#243056] p-4 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#243056] pb-2">
            <span className="text-xs font-black text-white tracking-wide uppercase">
              🌍 MACRO ECONOMIC & GEOPOLITICAL FLOWS
            </span>
            {parsed.macroRegime && (
              <span className="bg-purple-500/20 text-purple-300 font-bold text-[9px] px-2.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-widest">
                Regime: {parsed.macroRegime}
              </span>
            )}
          </div>

          {parsed.macroLede && (
            <p className="text-xs text-[#9aa3c7] font-medium italic">
              "{parsed.macroLede}"
            </p>
          )}

          {parsed.macroEvents.length > 0 ? (
            <div className="space-y-3 pt-1">
              {parsed.macroEvents.map((evt, eIdx) => (
                <div 
                  key={eIdx} 
                  onClick={() => triggerInstantAiInquiry(`Discuss the geopolitical/macro event from the ${activeDate} report: "${evt.kl}" (${evt.when}). Detail: "${evt.kd || evt.kv}". What are the broader macro impact conclusions?`)}
                  className="border-l-2 border-indigo-500/40 pl-3 py-1 ml-1 space-y-0.5 cursor-pointer hover:bg-white/5 hover:border-indigo-400 p-1.5 rounded transition-all group relative"
                  title="Click to ask AI about this macro event"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-400/90 font-bold font-mono">{evt.when}</span>
                    <Sparkles className="w-2.5 h-2.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h6 className="text-xs font-black text-white group-hover:text-indigo-300 transition-colors">{evt.kl}</h6>
                  <p className="text-xs text-[#cfd8ff] font-medium">{evt.kd || evt.kv}</p>
                </div>
              ))}
            </div>
          ) : (
            parsed.macroTextLines && parsed.macroTextLines.length > 0 && (
              <div className="space-y-2 pt-1">
                {parsed.macroTextLines.map((line, idx) => (
                  <p key={idx} className="text-xs text-[#cfd8ff] font-medium border-l-2 border-indigo-500/20 pl-2 py-0.5">{line}</p>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Scoreboard Metrics Tables section */}
      {parsed.isScoreboard && parsed.scoreTables.slice(0, 10).length > 0 && (
        <div className="space-y-5">
          {parsed.scoreTables.slice(0, 10).map((tbl, tIdx) => (
            <div key={tIdx} className="bg-black/30 border border-[#243056] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#121935] px-4 py-2.5 border-b border-[#243056]">
                <h5 className="text-xs font-black text-white uppercase tracking-wider">
                  📊 {tbl.title}
                </h5>
              </div>
              
              {/* Desktop/Tablet: High density data table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-black/50 border-b border-[#243056]">
                      {tbl.headers.map((hdr, hIdx) => (
                        <th key={hIdx} className="p-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                          {hdr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tbl.rows.slice(0, 100).map((rowItem, rIdx) => {
                      const row = (rowItem && typeof rowItem === 'object' && 'cells' in rowItem && Array.isArray(rowItem.cells)) ? rowItem.cells : (Array.isArray(rowItem) ? rowItem : []);
                      const values = row.map((cellObj: any) => cellObj?.text || "").filter(Boolean).join(", ");
                      return (
                        <tr 
                          key={rIdx} 
                          onClick={() => {
                            triggerInstantAiInquiry(`In the scorecard table "${tbl.title}" from ${activeDate}, analyze this specific line/row: [${tbl.headers.join(" | ")}] -> [${values}]. What can we infer from these scores?`);
                          }}
                          className="border-b border-[#243056]/30 hover:bg-[#6366f1]/10 hover:text-white transition-colors cursor-pointer group font-mono text-[11px]"
                          title="Click row to ask trends agent to compile metric breakdown"
                        >
                          {row.map((cell: any, cIdx: number) => (
                            <td key={cIdx} className="p-2.5 font-mono text-[#cfd8ff] font-medium">
                              {cell.sparkles.length > 0 ? (
                                <div className="flex flex-wrap gap-1 font-sans">
                                  {cell.sparkles.map((spk: any, sIdx: number) => (
                                    <span 
                                      key={sIdx} 
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                        spk.className.includes("p3") && "bg-emerald-950 text-emerald-300 border border-emerald-500/25",
                                        spk.className.includes("p2") && "bg-emerald-950/60 text-emerald-400 border border-emerald-500/10",
                                        spk.className.includes("n3") && "bg-red-950 text-red-300 border border-red-500/25",
                                        spk.className.includes("n2") && "bg-red-950/60 text-red-400 border border-red-500/10",
                                        spk.className.includes("none") && "bg-black/40 text-gray-500"
                                      )}
                                    >
                                      {spk.text}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                cell.text
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Screens: Highly responsive Screener Grid Tiles */}
              <div className="block md:hidden p-3.5 space-y-3.5 bg-black/10">
                <div className="grid grid-cols-1 gap-3">
                  {tbl.rows.slice(0, 100).map((rowItem, rIdx) => {
                    const row = (rowItem && typeof rowItem === 'object' && 'cells' in rowItem && Array.isArray(rowItem.cells)) ? rowItem.cells : (Array.isArray(rowItem) ? rowItem : []);
                    const mainCell = row[0];
                    const restCells = row.slice(1);
                    const mainHeader = tbl.headers[0] || "Asset";
                    const rowRepresentation = row.map((cellObj: any) => cellObj?.text || "").filter(Boolean).join(", ");

                    return (
                      <div 
                        key={rIdx}
                        onClick={() => {
                          triggerInstantAiInquiry(`In the scorecard table "${tbl.title}" from ${activeDate}, analyze this specific line/row: [${tbl.headers.join(" | ")}] -> [${rowRepresentation}]. What can we infer from these scores?`);
                        }}
                        className="bg-[#121935]/80 hover:bg-[#6366f1]/15 border border-[#243056] hover:border-indigo-500/50 p-4 rounded-xl space-y-3 cursor-pointer transition-all group relative active:scale-[0.98]"
                        title="Ask AI about this entity"
                      >
                        {/* Tile Header */}
                        <div className="flex items-center justify-between border-b border-[#243056]/50 pb-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase text-gray-400 font-bold font-mono tracking-wider">{mainHeader}</span>
                            <div className="text-xs font-mono font-black mt-0.5">
                              {mainCell?.sparkles && mainCell.sparkles.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {mainCell.sparkles.map((spk: any, sIdx: number) => (
                                    <span 
                                      key={sIdx} 
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                        spk.className.includes("p3") && "bg-emerald-950 text-emerald-300 border border-emerald-500/25",
                                        spk.className.includes("p2") && "bg-emerald-950/60 text-emerald-400 border border-emerald-500/10",
                                        spk.className.includes("n3") && "bg-red-950 text-red-300 border border-red-500/25",
                                        spk.className.includes("n2") && "bg-red-950/60 text-red-400 border border-red-500/10",
                                        spk.className.includes("none") && "bg-black/40 text-gray-500"
                                      )}
                                    >
                                      {spk.text}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-white text-xs">{mainCell?.text || "—"}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 bg-purple-500/15 border border-purple-500/25 text-purple-200 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                            <span>Ask AI</span>
                          </div>
                        </div>

                        {/* Tile Fields */}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {restCells.map((cell: any, cIdx: number) => {
                            const headerName = tbl.headers[cIdx + 1] || "Metric";
                            return (
                              <div key={cIdx} className="bg-black/25 p-2 rounded-lg border border-[#243056]/30 flex flex-col justify-between">
                                <span className="text-[9px] text-[#9aa3c7] font-bold uppercase font-mono tracking-wide">{headerName}</span>
                                <div className="text-xs font-black font-mono text-white mt-1">
                                  {cell.sparkles && cell.sparkles.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {cell.sparkles.map((spk: any, sIdx: number) => (
                                        <span 
                                          key={sIdx} 
                                          className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold",
                                            spk.className.includes("p3") && "bg-emerald-950 text-emerald-300 border border-emerald-500/25",
                                            spk.className.includes("p2") && "bg-emerald-950/60 text-emerald-400 border border-emerald-500/10",
                                            spk.className.includes("n3") && "bg-red-950 text-red-300 border border-red-500/25",
                                            spk.className.includes("n2") && "bg-red-950/60 text-red-400 border border-red-500/10",
                                            spk.className.includes("none") && "bg-black/40 text-gray-500"
                                          )}
                                        >
                                          {spk.text}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    cell.text
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
            </div>
          ))}
        </div>
      )}

      {/* Standard Daily News Impact List */}
      {!parsed.isScoreboard && parsed.newsItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#243056] pb-2">
            <h4 className="text-[10px] uppercase font-black tracking-widest text-[#cfd8ff] opacity-60">
              📰 PARSED EVENT INSIGHT FEED ({parsed.newsItems.length} Stories)
            </h4>
          </div>

          <div className="space-y-3.5">
            {parsed.newsItems.map((news, nIdx) => (
              <div key={nIdx} className="bg-black/30 border border-[#243056] hover:border-indigo-500/30 rounded-xl p-4 space-y-3 transition-colors relative">
                {/* News item meta header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243056]/30 pb-2">
                  <span className="text-[10px] text-gray-400 font-mono font-medium">{news.meta}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                      "text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded",
                      news.priority.includes("1") ? "bg-[#ea3943]/20 text-[#ea3943]" : "bg-amber-400/20 text-amber-300"
                    )}>
                      Priority: {news.priority}
                    </span>
                    <span className="bg-blue-500/10 text-blue-300 text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded">
                      {news.category}
                    </span>
                    <span className="bg-purple-500/10 text-purple-300 text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded">
                      Conf: {news.confidence}
                    </span>
                    <button
                      onClick={() => triggerInstantAiInquiry(`In the daily impact analysis on date ${activeDate}, discuss this news story in depth: "${news.heading}". Priority: ${news.priority}, Category: ${news.category}. What is the outlook for related tickers?`)}
                      className="flex items-center gap-1 text-[9px] uppercase font-extrabold tracking-wider bg-purple-500/25 border border-purple-500/45 text-purple-200 hover:bg-indigo-600 hover:text-white px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                      title="Click to Ask AI about this news event"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                      Ask AI
                    </button>
                  </div>
                </div>

                {/* Story heading */}
                <h5 className="text-sm font-extrabold text-white leading-snug">
                  {news.heading}
                </h5>

                {/* Target Ticker badges */}
                {news.tickers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {news.tickers.map((tk: any, tIdx: number) => (
                      <span 
                        key={tIdx} 
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold font-mono border",
                          tk.className.includes("win") && "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                          tk.className.includes("lose") && "bg-red-500/10 border-red-500/30 text-red-300",
                          !tk.className.includes("win") && !tk.className.includes("lose") && "bg-white/5 border-white/10 text-gray-300"
                        )}
                      >
                        {tk.text}
                      </span>
                    ))}
                  </div>
                )}

                {/* Story Levels (Technical Insight decomposition) */}
                {news.levels.length > 0 && (
                  <div className="bg-black/40 border border-white/5 p-3 rounded-lg space-y-2">
                    {news.levels.map((lvl: any, lIdx: number) => (
                      <div 
                        key={lIdx} 
                        onClick={() => triggerInstantAiInquiry(`Regarding news event "${news.heading}" on date ${activeDate}: Analyze the technical detail corresponding to "${lvl.lh || `Level ${lIdx + 1}`}" which highlights target: "${lvl.lc}".`)}
                        className="text-xs space-y-0.5 cursor-pointer hover:bg-indigo-500/10 p-1.5 rounded transition-all group relative"
                        title="Click to Analyze technical detail with Trends AI"
                      >
                        <div className="font-bold text-[#ecc94b] font-mono uppercase text-[10px] flex items-center justify-between">
                          <span>{lvl.lh || `Level ${lIdx + 1}`}</span>
                          <Sparkles className="w-2.5 h-2.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-[#cfd8ff] leading-relaxed font-medium">
                          {lvl.lc}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Winner beneficiaries and loser victims sidebar info inside news card */}
                {(news.beneficiaries.length > 0 || news.victims.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    {news.beneficiaries.length > 0 && (
                      <div className="bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10">
                        <span className="font-bold text-emerald-400 block mb-0.5">🚀 Benefitted Plays:</span>
                        <span className="text-[#cfd8ff] font-mono leading-relaxed">{news.beneficiaries.join(", ")}</span>
                      </div>
                    )}
                    {news.victims.length > 0 && (
                      <div className="bg-red-500/5 p-2.5 rounded-lg border border-red-500/10">
                        <span className="font-bold text-red-400 block mb-0.5">⚠️ Victimized / Exposed:</span>
                        <span className="text-[#cfd8ff] font-mono leading-relaxed">{news.victims.join(", ")}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Dynamic timeline checklist if present */}
                {news.timeline.length > 0 && (
                  <div className="space-y-1 bg-black/10 p-2.5 rounded-lg border border-white/5 text-[11px]">
                    <span className="font-bold text-gray-400 block uppercase tracking-wider text-[9px] mb-1">⏱️ Event Milestones Checklist (Click to analyze)</span>
                    {news.timeline.map((line: any, tmIdx: number) => (
                      <div 
                        key={tmIdx} 
                        onClick={() => triggerInstantAiInquiry(`In the daily report ${activeDate} regarding "${news.heading}", discuss this milestone timeline event: "${line.b}" - text details: "${line.text}". What triggers this timeline stage?`)}
                        className="flex items-start gap-2 text-[#cfd8ff] font-medium leading-relaxed cursor-pointer hover:bg-white/5 p-1 rounded transition-all group"
                        title="Ask AI about this milestone cell"
                      >
                        <span className="text-[#ecc94b] font-bold group-hover:scale-110 transition-transform">✓</span>
                        <span className="flex-1"><b>{line.b}</b> {line.text.replace(line.b, '')}</span>
                        <Sparkles className="w-2.5 h-2.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center" />
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
