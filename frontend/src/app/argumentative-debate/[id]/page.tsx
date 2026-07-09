"use client";
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Database, CheckCircle2, XCircle, Hash, Gavel, Bot, User, ChevronDown, ChevronUp, AlertCircle, LayoutGrid, FileText, MessageSquare, Bug, Target } from "lucide-react";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

const MainSidebar = () => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { icon: <LayoutGrid size={20} />, label: "Dashboard", path: "/" },
    { icon: <Target size={20} />, label: "Analysis Agent", path: "/harness" },
    { icon: <FileText size={20} />, label: "Debate Annotation", path: "/debate-annotation" },
    { icon: <MessageSquare size={20} />, label: "Basic Debate", path: "/debate/new" },
    { icon: <Bug size={20} />, label: "Debug", path: "/debate/debug" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-30 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div
        className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-2 shadow-lg shadow-slate-200 cursor-pointer"
        onClick={() => router.push("/")}
      >
        <LayoutGrid size={20} />
      </div>

      <nav className="flex flex-col gap-3 w-full px-2">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={`p-3 rounded-xl transition-colors relative group ${
              isActive(item.path)
                ? "bg-blue-50 text-blue-600"
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            }`}
          >
            {item.icon}
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

const LatexRenderer = ({ text }: { text: string }) => {
  const [parts, setParts] = useState<React.ReactNode[]>([]);
  useEffect(() => {
    if (!text) {
      setParts([]);
      return;
    }
    if (!(window as any).katex) {
      setParts([<span key="raw" className="whitespace-pre-wrap">{text}</span>]);
      return;
    }
    const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$[^$\n]+(?<!\\)\$)/g;
    const splitText = text.split(regex);
    const renderedParts = splitText.map((part, index) => {
      if (regex.test(part)) {
        try {
          const isDisplay = part.startsWith("$$") || part.startsWith("\\[");
          const cleanTex = part.replace(/^(\$\$|\\\[|\\\(|\$)|(\$\$|\\\]|\\\)|(?<!\\)\$)$/g, "");
          const html = (window as any).katex.renderToString(cleanTex, { displayMode: isDisplay, throwOnError: false, trust: true });
          return <span key={index} className={isDisplay ? "block my-4 text-center" : "inline-block align-middle mx-0.5"} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) {
          return <span key={index} className="text-red-500 font-mono text-xs">{part}</span>;
        }
      } else {
        if (!part) return null;
        const boldParts = part.split(/(\*\*.*?\*\*)/g).map((subPart, subIndex) => {
          if (subPart.startsWith("**") && subPart.endsWith("**")) {
            return <strong key={subIndex} className="font-bold">{subPart.slice(2, -2)}</strong>;
          }
          return subPart;
        });
        return <span key={index} className="whitespace-pre-wrap leading-relaxed">{boldParts}</span>;
      }
    });
    setParts(renderedParts);
  }, [text]);
  return <span className="latex-content">{parts}</span>;
};

const ParsedTextRenderer = ({ text, role, isAI = true }: { text: string, role?: string, isAI?: boolean }) => {
  if (!text) return null;
  
  const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const argumentMatch = text.match(/<argument>([\s\S]*?)<\/argument>/i);
  
  let thinkingText = thinkingMatch ? thinkingMatch[1].trim() : null;
  let mainText = "";

  if (argumentMatch) {
    mainText = argumentMatch[1].trim();
  } else {
    let cleanedText = text;
    if (thinkingMatch) {
      cleanedText = cleanedText.replace(/<thinking>[\s\S]*?<\/thinking>/i, '');
    }

    cleanedText = cleanedText
      .replace(/Judge Evaluation(?: \((AI|Human)\))?/ig, '')
      .replace(/Final Verdict/ig, '')
      .replace(/^Correct$/igm, '')
      .replace(/^Incorrect$/igm, '')
      .replace(/Answer:\s*[A-Z]/ig, '')
      .replace(/^[-\s]+|[-\s]+$/g, '') 
      .trim();

    if (cleanedText.length > 0) {
      mainText = cleanedText;
    } else if (thinkingText) {
      mainText = thinkingText;
      thinkingText = null; 
    }
  }

  const renderFormattedText = (str: string) => {
    const cleanStr = str.replace(/<\/?argument>/gi, '');
    const parts = cleanStr.split(/(<v_quote>[\s\S]*?<\/v_quote>|<u_quote>[\s\S]*?<\/u_quote>|<quote>[\s\S]*?<\/quote>)/gi);
    
    return parts.map((part, i) => {
      if (part.toLowerCase().startsWith('<v_quote>')) {
        const cleanQuote = part.replace(/<\/?v_quote>/gi, '');
        return (
          <span key={i} className="relative inline-block mx-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border-b border-emerald-300 rounded shadow-sm italic text-sm">
            "{cleanQuote}"<CheckCircle2 size={10} className="absolute -top-1.5 -right-1.5 text-emerald-500 bg-white rounded-full" />
          </span>
        );
      }
      if (part.toLowerCase().startsWith('<u_quote>')) {
        const cleanQuote = part.replace(/<\/?u_quote>/gi, '');
        return (
          <span key={i} className="relative inline-block mx-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border-b border-amber-300 rounded shadow-sm italic text-sm">
            "{cleanQuote}"<AlertCircle size={10} className="absolute -top-1.5 -right-1.5 text-amber-500 bg-white rounded-full" />
          </span>
        );
      }
      if (part.toLowerCase().startsWith('<quote>')) {
        const cleanQuote = part.replace(/<\/?quote>/gi, '');
        return (
          <span key={i} className="relative inline-block mx-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 border-b border-slate-300 rounded shadow-sm italic text-sm">
            "{cleanQuote}"
          </span>
        );
      }
      return <LatexRenderer key={i} text={part} />;
    });
  };

  const thinkingTitle = role ? `${role} Internal Monologue` : (isAI ? 'AI Internal Monologue' : 'Internal Monologue');
  const ThinkingIcon = isAI ? Bot : User;

  return (
    <div className="space-y-4">
      {thinkingText && (
        <details className="group bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <summary className="px-4 py-2.5 cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between select-none hover:bg-slate-100 transition-colors">
            <div className="flex items-center gap-2">
              <ThinkingIcon size={14} className="text-slate-400" />
              {thinkingTitle}
            </div>
            <ChevronDown size={14} className="group-open:rotate-180 transition-transform duration-300" />
          </summary>
          <div className="px-5 py-4 text-xs text-slate-600 whitespace-pre-wrap border-t border-slate-200 bg-white font-sans leading-relaxed">
            {renderFormattedText(thinkingText)}
          </div>
        </details>
      )}
      {mainText && (
        <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
          {renderFormattedText(mainText)}
        </div>
      )}
    </div>
  );
};

const AgentCard = ({ role, content, isCorrect, defaultExpanded = false, modelName }: { role: "Proponent" | "Opponent" | "Judge"; content: string; isCorrect?: boolean; defaultExpanded?: boolean; modelName?: string; }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const isAI = modelName?.toLowerCase() !== "human" && modelName?.toLowerCase() !== "user";
  const displayIcon = isAI ? <Bot size={16} /> : <User size={16} />;
  const titleSuffix = isAI ? "(AI)" : "(Human)";

  const styles = {
    Proponent: { wrapper: "border-blue-200 ring-1 ring-blue-50", header: "bg-blue-50/50 border-b border-blue-100", iconBg: "bg-blue-100 text-blue-700", title: `Proponent ${titleSuffix}`, subtitle: "Defending Correct Answer", subtitleColor: "text-blue-600" },
    Opponent: { wrapper: "border-rose-200 ring-1 ring-rose-50", header: "bg-rose-50/50 border-b border-rose-100", iconBg: "bg-rose-100 text-rose-700", title: `Opponent ${titleSuffix}`, subtitle: "Defending Incorrect Answer", subtitleColor: "text-rose-600" },
    Judge: { wrapper: "border-indigo-200 ring-1 ring-indigo-50", header: "bg-indigo-50/50 border-b border-indigo-100", iconBg: "bg-indigo-100 text-indigo-700", title: `Judge Evaluation ${titleSuffix}`, subtitle: "Final Verdict", subtitleColor: "text-indigo-600" }
  }[role];

  return (
    <div className={`mb-4 rounded-2xl border overflow-hidden transition-all shadow-sm bg-white ${styles.wrapper}`}>
      <div className={`px-5 py-3 flex items-center justify-between ${styles.header}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${styles.iconBg}`}>{displayIcon}</div>
          <div>
            <div className="text-sm font-bold text-slate-800">{styles.title}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${styles.subtitleColor}`}>{styles.subtitle}</div>
          </div>
        </div>
        {isCorrect !== undefined && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${isCorrect ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
            {isCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{isCorrect ? "Correct" : "Incorrect"}
          </div>
        )}
      </div>
      <div className="relative">
        <div className={`px-5 py-4 transition-all duration-300 ease-in-out ${!isExpanded ? "max-h-64 overflow-hidden" : ""}`}>
          <ParsedTextRenderer text={content} role={role} isAI={isAI} />
        </div>
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white/90 to-transparent flex items-end justify-center pb-3">
            <button onClick={() => setIsExpanded(true)} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all z-10">
              <ChevronDown size={14} /> Read full argument
            </button>
          </div>
        )}
        {isExpanded && (
          <div className="px-5 pb-4 pt-2 flex justify-center border-t border-slate-50 mt-4">
            <button onClick={() => setIsExpanded(false)} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider">
              <ChevronUp size={12} /> Show Less
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ArgumentativeDebateDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debateData, setDebateData] = useState<any>(null);
  
  const [showOnlyIncorrect, setShowOnlyIncorrect] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

  useEffect(() => {
    setSelectedQuestionIndex(0);
  }, [showOnlyIncorrect]);

  useEffect(() => {
    if (!(window as any).katex) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
      document.head.appendChild(script);
    }
    if (!document.querySelector('link[href*="katex"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const fetchRun = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/load-argumentative-debates?runId=${runId}`);
        if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
        const parsedData = await response.json();
        if (parsedData.success && parsedData.run) {
          const runData = parsedData.run;
          setDebateData({
            ...runData,
            run_name: runData.run_name || "Argumentative Debate",
            metrics: runData.metrics,
            results: (runData.questions || []).map((q: any) => ({
              question_index: q.question_index,
              is_correct: q.is_correct,
              judgment: q.judgment,
              transcript: {
                story_title: q.story_title,
                question: q.question_text,
                answers: { correct: q.correct_answer, incorrect: q.incorrect_answer },
                rounds: (q.rounds || []).map((r: any, rIdx: number) => {
                  const rawCorrect = q.responses?.[rIdx]?.correct_argument || "";
                  const rawIncorrect = q.responses?.[rIdx]?.incorrect_argument || "";
                  
                  const getThinking = (text: string) => {
                    if (!text) return "";
                    const match = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
                    return match ? match[0] + "\n\n" : "";
                  };

                  const processedCorrect = r.correct_argument || rawCorrect;
                  const processedIncorrect = r.incorrect_argument || rawIncorrect;

                  return {
                    correct: processedCorrect.includes('<thinking>') 
                      ? processedCorrect 
                      : getThinking(rawCorrect) + processedCorrect,
                      
                    incorrect: processedIncorrect.includes('<thinking>') 
                      ? processedIncorrect 
                      : getThinking(rawIncorrect) + processedIncorrect,
                  };
                }),
              }
            }))
          });
        } else {
          throw new Error(parsedData.message || "Failed to load run data");
        }
      } catch (err: any) {
        console.error("Fetch/Parse Error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (runId) fetchRun();
  }, [runId]);

  const filteredResults = useMemo(() => {
    if (!debateData?.results) return [];
    return debateData.results.filter((q: any) => showOnlyIncorrect ? q.is_correct === false : true);
  }, [debateData, showOnlyIncorrect]);

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400 bg-[#f8f9fc] font-sans">Loading debate data...</div>;
  if (error) return <div className="h-screen flex flex-col items-center justify-center text-red-500 bg-[#f8f9fc] font-sans"><AlertCircle size={48} className="mb-4" /><p>Error loading data: {error}</p></div>;
  if (!debateData || !debateData.results) return <div className="h-screen flex items-center justify-center text-slate-400 bg-[#f8f9fc] font-sans">No data found.</div>;

  const currentQuestion = filteredResults[selectedQuestionIndex];
  const transcript = currentQuestion?.transcript;

  const handleNext = () => { if (selectedQuestionIndex < filteredResults.length - 1) setSelectedQuestionIndex(prev => prev + 1); };
  const handlePrev = () => { if (selectedQuestionIndex > 0) setSelectedQuestionIndex(prev => prev - 1); };

  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      <MainSidebar />
      
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors"><ArrowLeft size={18} /></button>
          <h2 className="font-bold text-slate-700 truncate text-sm" title={debateData.run_name}>{debateData.run_name}</h2>
        </div>
        
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Question List</span>
            <span className="text-xs font-mono text-slate-400">{filteredResults.length} items</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-max group">
            <input 
              type="checkbox"
              checked={showOnlyIncorrect}
              onChange={(e) => setShowOnlyIncorrect(e.target.checked)}
              className="rounded border-slate-300 text-rose-500 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Show errors only</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredResults.map((q: any, idx: number) => {
            const isActive = selectedQuestionIndex === idx;
            return (
              <button key={idx} onClick={() => setSelectedQuestionIndex(idx)} className={`w-full flex items-center justify-between px-4 py-3 border-b border-slate-100 transition-all ${isActive ? "bg-blue-50 border-l-4 border-l-blue-600" : "bg-white hover:bg-slate-50 border-l-4 border-l-transparent"}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono ${isActive ? "font-bold text-blue-700" : "text-slate-500"}`}>Question {(q.question_index ?? idx) + 1}</span>
                </div>
                {q.is_correct !== undefined && (
                  <div className={`flex items-center gap-1 p-1 rounded-md text-[10px] font-bold ${q.is_correct ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
                    {q.is_correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc]">
        {currentQuestion ? (
          <>
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-[0_2px_12px_rgba(0,0,0,0.02)] z-10 sticky top-0">
              <div className="flex items-center gap-4">
                {debateData.metrics && (
                  <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-emerald-100 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Accuracy: {(debateData.metrics.accuracy * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <button onClick={handlePrev} disabled={selectedQuestionIndex <= 0} className="p-1.5 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600"><ChevronLeft size={18} /></button>
                <span className="px-4 text-sm font-mono font-medium text-slate-600 min-w-[100px] text-center border-x border-slate-100">{selectedQuestionIndex + 1} / {filteredResults.length}</span>
                <button onClick={handleNext} disabled={selectedQuestionIndex >= filteredResults.length - 1} className="p-1.5 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600"><ChevronRight size={18} /></button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
              <div className="max-w-5xl mx-auto space-y-8 pb-20">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Context & Answers</h3>
                    <div className="flex items-center gap-1 text-slate-400 text-xs font-mono"><Hash size={12} /> {(currentQuestion.question_index ?? selectedQuestionIndex) + 1}</div>
                  </div>
                  <div className="p-6">
                    {transcript.story_title && <h4 className="text-xl font-bold text-slate-900 mb-4 pb-4 border-b border-slate-100">{transcript.story_title}</h4>}
                    <div className="text-lg text-slate-800 font-medium leading-relaxed mb-6"><LatexRenderer text={transcript.question || "No question text available."} /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100/80 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2 block">Correct Answer</span>
                        <div className="text-emerald-950 font-medium text-sm"><LatexRenderer text={transcript.answers?.correct || "N/A"} /></div>
                      </div>
                      <div className="bg-rose-50/50 rounded-xl p-5 border border-rose-100/80 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-400"></div>
                        <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-2 block">Incorrect Answer</span>
                        <div className="text-rose-950 font-medium text-sm"><LatexRenderer text={transcript.answers?.incorrect || "N/A"} /></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-10 pt-4">
                  {(transcript.rounds || []).map((round: any, rIdx: number) => (
                    <div key={rIdx} className="relative">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-px bg-slate-200 flex-1" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-[#f8f9fc] px-4 py-1 rounded-full border border-slate-200">
                          Round {rIdx + 1}
                        </span>
                        <div className="h-px bg-slate-200 flex-1" />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {round.correct && <AgentCard role="Proponent" content={round.correct} defaultExpanded={true} modelName={debateData.debater_model} />}
                        {round.incorrect && <AgentCard role="Opponent" content={round.incorrect} defaultExpanded={true} modelName={debateData.debater_model} />}
                      </div>
                    </div>
                  ))}

                  {currentQuestion.judgment && (
                    <div className="pt-8">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-px bg-indigo-200 flex-1" />
                        <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-4 py-1 rounded-full border border-indigo-200">Verdict</span>
                        <div className="h-px bg-indigo-200 flex-1" />
                      </div>
                      <div className="max-w-4xl mx-auto">
                        <AgentCard role="Judge" content={currentQuestion.judgment} isCorrect={currentQuestion.is_correct} defaultExpanded={false} modelName={debateData.judge_model} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-6 shadow-sm">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="text-2xl font-bold text-slate-700 mb-2">Perfect Score!</h3>
            <p className="text-slate-500 max-w-md">There are no incorrect answers in this run to review.</p>
          </div>
        )}
      </main>
    </div>
  );
}