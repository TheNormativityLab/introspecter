"use client";
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Database,
  BarChart3,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Hash,
  Check,
  LayoutGrid,
  FileText,
  Gavel,
  Bug,
  Target
} from "lucide-react";
import {
  MultiRunDebateData,
  DebateRun,
  EvaluationResult,
  IncorrectSwitchQuestion,
} from "../../../types/debate";
import {
  solveMathProblems,
  parseMmluAnswer,
  parseCommonsenseQaAnswer,
  parseMathAnswer,
  parseGsm8kAnswer,
  parseCustomQuestionsAnswer,
  type TaskName,
} from "../../../utils/evaluation";
import "katex/dist/katex.min.css";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

const Sidebar = () => {
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
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
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
      setParts([<span key="raw" className="whitespace-pre-wrap font-sans">{text}</span>]);
      return;
    }
    const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$[^$\n]+(?<!\\)\$)/g;
    
    const splitText = text.split(regex);
    
    const renderedParts = splitText.map((part, index) => {
      if (regex.test(part)) {
        try {
          const isDisplay = part.startsWith("$$") || part.startsWith("\\[");
          const cleanTex = part.replace(/^(\$\$|\\\[|\\\(|\$)|(\$\$|\\\]|\\\)|(?<!\\)\$)$/g, "");
          
          const html = (window as any).katex.renderToString(cleanTex, {
            displayMode: isDisplay,
            throwOnError: false,
            trust: true,
          });
          
          return (
            <span 
              key={index} 
              className={isDisplay ? "block my-4 text-center" : "inline-block align-middle mx-0.5"}
              dangerouslySetInnerHTML={{ __html: html }} 
            />
          );
        } catch (e) {
          return <span key={index} className="text-red-500 font-mono text-xs">{part}</span>;
        }
      } 
      else {
        if (!part) return null;
        
        const boldParts = part.split(/(\*\*.*?\*\*)/g).map((subPart, subIndex) => {
            if (subPart.startsWith("**") && subPart.endsWith("**")) {
                return <strong key={subIndex} className="font-bold text-slate-900">{subPart.slice(2, -2)}</strong>;
            }
            return subPart;
        });

        return (
          <span key={index} className="whitespace-pre-wrap leading-7 text-slate-700 font-sans">
            {boldParts}
          </span>
        );
      }
    });

    setParts(renderedParts);
  }, [text]);

  return <div className="latex-content text-sm">{parts}</div>;
};

const getDatasetDisplayName = (dataset: string) => {
    const map: Record<string, string> = {
        gsm8k: "GSM8K",
        mmlu: "MMLU",
        commonsense_qa: "CommonsenseQA",
        custom_questions: "Custom",
        math: "MATH"
    };
    return map[dataset.toLowerCase()] || dataset.toUpperCase();
};

const inferDatasetFromTask = (task: string, fallbackDatasetName?: string): string => {
  if (fallbackDatasetName) {
    const normalized = fallbackDatasetName.toLowerCase().trim();
    if (["mmlu", "gsm8k", "commonsense_qa", "math", "custom_questions"].includes(normalized)) return normalized;
  }
  if (!task) return "unknown";
  const lowerTask = task.toLowerCase();
  if (lowerTask.includes("mmlu")) return "mmlu";
  if (lowerTask.includes("gsm8k")) return "gsm8k";
  if (lowerTask.includes("custom_questions")) return "custom_questions";
  if (lowerTask.includes("commonsense_qa")) return "commonsense_qa";
  if (lowerTask.includes("math")) return "math";
  return "unknown";
};

const safeGetQuestions = (resultData: any): any[] => {
  if (!resultData) return [];
  if (Array.isArray(resultData)) return resultData;
  if (typeof resultData === "object") {
    if (Array.isArray(resultData.questions)) return resultData.questions;
    if (resultData.data && Array.isArray(resultData.data.questions)) return resultData.data.questions;
    if (resultData.question_text || resultData.question) return [resultData];
  }
  return [];
};

const evaluateResponse = (response: string, correctAnswer: string | number, taskName: TaskName): EvaluationResult => {
  let extractedAnswer: string | number | null = null;
  if (!response) return { isCorrect: false, extractedAnswer: null };
  
  if (taskName === "mmlu") extractedAnswer = parseMmluAnswer(response) ?? solveMathProblems(response);
  else if (taskName === "math") extractedAnswer = parseMathAnswer(response);
  else if (taskName === "commonsense_qa") extractedAnswer = parseCommonsenseQaAnswer(response);
  else if (taskName === "custom_questions") extractedAnswer = parseCustomQuestionsAnswer(response);
  else if (taskName === "gsm8k") extractedAnswer = parseGsm8kAnswer(response);

  let isCorrect = false;
  if (extractedAnswer !== null) {
    if (taskName === "gsm8k") {
      const gtValue = solveMathProblems(correctAnswer.toString());
      const predValue = solveMathProblems(extractedAnswer.toString());
      isCorrect = predValue === gtValue;
    } else if (taskName === "math") {
      const gtValue = typeof correctAnswer === "string" ? parseFloat(correctAnswer) : correctAnswer;
      const predValue = typeof extractedAnswer === "string" ? parseFloat(extractedAnswer) : extractedAnswer;
      isCorrect = Math.abs(predValue - gtValue) < 1e-6;
    } else {
      isCorrect = extractedAnswer.toString().toUpperCase() === correctAnswer.toString().toUpperCase();
    }
  }
  return { isCorrect, extractedAnswer };
};

const SidebarItem = ({ 
  index, 
  isActive, 
  hasSwitch, 
  onClick 
}: { 
  index: number; 
  isActive: boolean; 
  hasSwitch: boolean; 
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3 border-b border-slate-100 transition-all ${
      isActive 
        ? "bg-blue-50 border-l-4 border-l-blue-600" 
        : "bg-white hover:bg-slate-50 border-l-4 border-l-transparent"
    }`}
  >
    <div className="flex items-center gap-3">
      <span className={`text-sm font-mono ${isActive ? "font-bold text-blue-700" : "text-slate-500"}`}>
        Question {index + 1}
      </span>
    </div>
    
    {hasSwitch && (
       <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700" title="Regression Detected">
          <TrendingDown size={12} />
       </div>
    )}
  </button>
);

const AgentCard = ({
  agentName,
  response,
  evaluation,
  isRegressionPoint, 
  defaultCollapsed = true, 
}: {
    agentName: string,
    response: string,
    evaluation?: EvaluationResult,
    isRegressionPoint?: boolean,
    defaultCollapsed?: boolean
}) => {
  const [isExpanded, setIsExpanded] = useState(isRegressionPoint ? true : !defaultCollapsed);
  const isCorrect = evaluation?.isCorrect;

  return (
    <div className={`mb-4 rounded-xl border overflow-hidden transition-all shadow-sm ${
      isRegressionPoint ? "border-red-200 ring-1 ring-red-200" : "border-slate-200"
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
          isRegressionPoint ? "bg-red-50/50" : "bg-slate-50"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${
             isRegressionPoint ? "bg-white text-red-600 border-red-200" : "bg-white text-slate-600 border-slate-200"
          }`}>
            {agentName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">{agentName}</div>
            {isRegressionPoint && <div className="text-[10px] font-bold text-red-600 uppercase">Regression Point</div>}
          </div>
        </div>

        <div className="flex items-center gap-3">
            {evaluation && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${
                    isCorrect 
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
                        : "bg-red-100 text-red-700 border-red-200"
                }`}>
                    {isCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {isCorrect ? "Correct" : "Incorrect"}
                </div>
            )}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white relative">
        <div className={`px-5 py-4 transition-all duration-300 ease-in-out ${
            !isExpanded ? "max-h-32 overflow-hidden" : ""
        }`}>
            <LatexRenderer text={response || "No response provided."} />
            
            {evaluation?.extractedAnswer && (
                 <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Extracted:</span>
                     <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 font-mono">
                        {evaluation.extractedAnswer}
                     </code>
                 </div>
            )}
        </div>

        {!isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-white via-white/90 to-transparent flex items-end justify-center pb-2">
                <button 
                    onClick={() => setIsExpanded(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all z-10"
                >
                    <ChevronDown size={14} /> Read full reasoning
                </button>
            </div>
        )}
        
        {isExpanded && (
             <div className="px-5 pb-3 pt-0 flex justify-center">
                 <button 
                    onClick={() => setIsExpanded(false)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider mt-2"
                >
                    <ChevronUp size={12} /> Show Less
                </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default function DebateDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const debateId = params.id as string;
  const initialSeed = searchParams.get("seed") || "default";

  const [loading, setLoading] = useState(true);
  const [debateData, setDebateData] = useState<MultiRunDebateData | null>(null);
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [showRegressionsOnly, setShowRegressionsOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'debate' | 'performance'>('debate');
  
  const [incorrectSwitches, setIncorrectSwitches] = useState<IncorrectSwitchQuestion[]>([]);
  const [evaluationResults, setEvaluationResults] = useState<{ [key: string]: EvaluationResult }>({});

  useEffect(() => {
    if (!(window as any).katex) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const fetchDebate = async () => {
      try {
        if (!debateId) return;
        const response = await fetch(`/api/single-debate?experimentName=${encodeURIComponent(debateId)}&seed=${encodeURIComponent(initialSeed)}`);
        const data = await response.json();
        setDebateData(data);
        if (data.runs) {
             const idx = data.runs.findIndex((r: any) => r.seed === initialSeed);
             if (idx !== -1) setSelectedRunIndex(idx);
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchDebate();
  }, [debateId, initialSeed]);

  const currentRun = useMemo(() => {
    if (!debateData) return null;
    if (Array.isArray(debateData.runs) && debateData.runs.length > 0) return debateData.runs[selectedRunIndex];
    if ((debateData as any).result_data) return debateData as any as DebateRun;
    return null;
  }, [debateData, selectedRunIndex]);

  useEffect(() => {
    if (!currentRun?.result_data) return;
    const taskName = inferDatasetFromTask(currentRun.wandb_metadata?.parsed_args?.task, currentRun.dataset_name) as TaskName;
    const questions = safeGetQuestions(currentRun.result_data);
    
    const switches: IncorrectSwitchQuestion[] = [];
    questions.forEach((q, qIdx) => {
        const rounds = q.debate_session?.rounds || [];
        if(rounds.length < 2) return;
        Object.keys(rounds[0].responses || {}).forEach(agent => {
            const evals = rounds.map((r: any) => evaluateResponse(r.responses[agent]||"", q.correct_answer, taskName).isCorrect);
            for(let i=1; i<evals.length; i++) {
                if(evals[i-1] && !evals[i]) {
                    switches.push({questionIndex: qIdx, agentName: agent, switchedFromRound: i-1, switchedToRound: i});
                }
            }
        });
    });
    setIncorrectSwitches(switches);
    setSelectedQuestionIndex(0);
  }, [currentRun]);

  const filteredQuestionIndices = useMemo(() => {
    if (!currentRun?.result_data) return [];
    const allIndices = safeGetQuestions(currentRun.result_data).map((_, i) => i);
    if (!showRegressionsOnly) return allIndices;
    const switchIndices = new Set(incorrectSwitches.map(s => s.questionIndex));
    return allIndices.filter(i => switchIndices.has(i));
  }, [currentRun, showRegressionsOnly, incorrectSwitches]);

  useEffect(() => {
     if (filteredQuestionIndices.length > 0 && !filteredQuestionIndices.includes(selectedQuestionIndex)) {
         setSelectedQuestionIndex(filteredQuestionIndices[0]);
     }
  }, [filteredQuestionIndices, selectedQuestionIndex]);

  useEffect(() => {
    if (!currentRun?.result_data) return;
    const questions = safeGetQuestions(currentRun.result_data);
    const qData = questions[selectedQuestionIndex];
    if (!qData) return;

    const taskName = inferDatasetFromTask(currentRun.wandb_metadata?.parsed_args?.task, currentRun.dataset_name) as TaskName;
    const evals: any = {};
    
    qData.debate_session?.rounds?.forEach((r: any, rIdx: number) => {
        Object.entries(r.responses).forEach(([agent, resp]) => {
            evals[`${agent}_${rIdx}`] = evaluateResponse(resp as string, qData.correct_answer, taskName);
        });
    });
    setEvaluationResults(evals);
  }, [selectedQuestionIndex, currentRun]);

  const handleNext = () => {
    const currPos = filteredQuestionIndices.indexOf(selectedQuestionIndex);
    if (currPos < filteredQuestionIndices.length - 1) setSelectedQuestionIndex(filteredQuestionIndices[currPos + 1]);
  };
  const handlePrev = () => {
    const currPos = filteredQuestionIndices.indexOf(selectedQuestionIndex);
    if (currPos > 0) setSelectedQuestionIndex(filteredQuestionIndices[currPos - 1]);
  };

  const currentQuestionData = safeGetQuestions(currentRun?.result_data)[selectedQuestionIndex];
  const actualAgentNames = currentQuestionData?.debate_session?.rounds?.[0]?.responses 
    ? Object.keys(currentQuestionData.debate_session.rounds[0].responses) 
    : [];
  const currentSwitches = incorrectSwitches.filter(s => s.questionIndex === selectedQuestionIndex);

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading data...</div>;
  if (!currentRun) return <div className="h-screen flex items-center justify-center text-slate-400">No data found.</div>;

  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      
      <Sidebar />

      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <button onClick={() => router.push('/')} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors">
                <ArrowLeft size={18} />
            </button>
            <h2 className="font-bold text-slate-700 truncate text-sm" title={currentRun.wandb_metadata?.parsed_args?.["experiment.name"]}>
                {currentRun.wandb_metadata?.parsed_args?.["experiment.name"] || "Experiment"}
            </h2>
        </div>

        <div className="p-4 bg-slate-50/50 border-b border-slate-100 space-y-3">
             <div className="bg-slate-200 p-1 rounded-lg flex">
                <button 
                    onClick={() => setViewMode('debate')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'debate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <MessageSquare size={14} /> Debate
                </button>
                <button 
                    onClick={() => setViewMode('performance')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'performance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <BarChart3 size={14} /> Metrics
                </button>
             </div>

             <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter List</span>
                 <span className="text-xs font-mono text-slate-400">{filteredQuestionIndices.length} items</span>
             </div>
             <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-white hover:border-slate-200 transition-all select-none">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showRegressionsOnly ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 bg-white'}`}>
                    {showRegressionsOnly && <Check size={12} />}
                </div>
                <input type="checkbox" className="hidden" checked={showRegressionsOnly} onChange={e => setShowRegressionsOnly(e.target.checked)} />
                <span className={`text-sm ${showRegressionsOnly ? "text-red-700 font-bold" : "text-slate-600"}`}>
                    Show Regressions Only
                </span>
             </label>
        </div>

        <div className="flex-1 overflow-y-auto">
            {filteredQuestionIndices.length > 0 ? (
                filteredQuestionIndices.map(idx => (
                    <SidebarItem 
                        key={idx} 
                        index={idx} 
                        isActive={selectedQuestionIndex === idx} 
                        hasSwitch={incorrectSwitches.some(s => s.questionIndex === idx)}
                        onClick={() => setSelectedQuestionIndex(idx)}
                    />
                ))
            ) : (
                <div className="p-10 text-center">
                    <div className="inline-flex p-3 rounded-full bg-slate-100 text-slate-400 mb-3"><Database size={24} /></div>
                    <p className="text-sm text-slate-400">No questions match your filter.</p>
                </div>
            )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc]">
         
         <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-[0_2px_12px_rgba(0,0,0,0.02)] z-10 sticky top-0">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-200">
                    <Database size={14} />
                    <span className="font-medium">Run:</span>
                    {debateData?.runs && debateData.runs.length > 1 ? (
                        <select 
                            value={selectedRunIndex}
                            onChange={(e) => setSelectedRunIndex(parseInt(e.target.value))}
                            className="bg-transparent border-none p-0 text-slate-900 font-bold focus:ring-0 cursor-pointer text-sm outline-none pl-1"
                        >
                            {debateData.runs.map((run: any, i: number) => (
                                <option key={i} value={i}>
                                    {getDatasetDisplayName(run.dataset_name || "Unknown")} (Seed {run.seed})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="font-bold text-slate-900">
                            {getDatasetDisplayName(currentRun.dataset_name || "Default")}
                        </span>
                    )}
                 </div>
             </div>

             {viewMode === 'debate' && (
                 <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                     <button 
                        onClick={handlePrev} 
                        disabled={filteredQuestionIndices.indexOf(selectedQuestionIndex) <= 0}
                        className="p-1.5 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600"
                     >
                        <ChevronLeft size={18} />
                     </button>
                     <span className="px-4 text-sm font-mono font-medium text-slate-600 min-w-[100px] text-center border-x border-slate-100">
                        {selectedQuestionIndex + 1} / {safeGetQuestions(currentRun.result_data).length}
                     </span>
                     <button 
                        onClick={handleNext} 
                        disabled={filteredQuestionIndices.indexOf(selectedQuestionIndex) >= filteredQuestionIndices.length - 1}
                        className="p-1.5 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600"
                     >
                        <ChevronRight size={18} />
                     </button>
                 </div>
             )}
         </header>

         <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {viewMode === 'performance' ? (
                <div className="max-w-5xl mx-auto space-y-6">
                     <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
                        <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><BarChart3 size={24} /></div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Performance Metrics</h2>
                                <p className="text-slate-500 text-sm">Individual agent accuracy across debate rounds.</p>
                            </div>
                        </div>
                        <div className="grid gap-6">
                             {currentRun.performance_data?.map((roundObj: any, idx: number) => {
                                 const roundKey = Object.keys(roundObj)[0];
                                 const roundData = roundObj[roundKey] || {};
                                 const majorityVote = roundData.majority_vote ?? 0;
                                 
                                 return (
                                     <div key={idx} className="border border-slate-100 rounded-xl p-6 bg-slate-50/30">
                                         <div className="flex justify-between items-center mb-4">
                                             <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Round {idx + 1}</span>
                                             <div className="flex items-baseline gap-2">
                                                 <span className="text-2xl font-bold text-slate-800">{(majorityVote * 100).toFixed(1)}%</span>
                                                 <span className="text-sm font-medium text-slate-500">Majority Vote</span>
                                             </div>
                                         </div>
                                         
                                         <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden mb-6">
                                             <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${majorityVote * 100}%` }} />
                                         </div>

                                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                              {Object.entries(roundData)
                                                .filter(([k]) => k !== 'majority_vote')
                                                .map(([agent, score]: any) => (
                                                  <div key={agent} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm flex items-center justify-between">
                                                      <div className="flex items-center gap-2 overflow-hidden">
                                                          <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                                              {agent.charAt(0).toUpperCase()}
                                                          </div>
                                                          <div className="text-xs font-medium text-slate-600 truncate" title={agent}>{agent}</div>
                                                      </div>
                                                      <div className={`text-sm font-bold font-mono ${(score >= 0.8) ? 'text-emerald-600' : (score < 0.5) ? 'text-rose-600' : 'text-slate-700'}`}>
                                                          {(score * 100).toFixed(0)}%
                                                      </div>
                                                  </div>
                                              ))}
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>
                     </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6 pb-20">
                    {currentSwitches.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <div className="bg-white p-1.5 rounded-full shadow-sm"><AlertOctagon className="text-red-600" size={18} /></div>
                            <div>
                                <h4 className="text-sm font-bold text-red-900">Regression Detected</h4>
                                <div className="text-sm text-red-800 mt-1 space-y-1">
                                    {currentSwitches.map((s, i) => (
                                        <div key={i}>
                                            <span className="font-bold bg-white/50 px-1 rounded">{s.agentName}</span> switched from <span className="font-bold text-emerald-700">Correct</span> to <span className="font-bold text-red-700">Incorrect</span> in Round {s.switchedToRound + 1}.
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Question</h3>
                            <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
                                <Hash size={12} /> {selectedQuestionIndex}
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="text-lg text-slate-800 font-medium leading-relaxed mb-6">
                                <LatexRenderer text={currentQuestionData?.question || ""} />
                            </div>
                            
                            <div className="bg-emerald-50/80 rounded-lg p-4 border border-emerald-100/50">
                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 block">Correct Answer</span>
                                <div className="text-emerald-900 font-mono text-sm">
                                    <LatexRenderer text={currentQuestionData?.correct_answer || ""} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8 mt-10">
                        {currentQuestionData?.debate_session?.rounds?.map((round: any, rIdx: number) => (
                            <div key={rIdx} className="relative">
                                {/* Round Header */}
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="h-px bg-slate-200 flex-1" />
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-[#f8f9fc] px-3">
                                        Round {rIdx + 1}
                                    </span>
                                    <div className="h-px bg-slate-200 flex-1" />
                                </div>

                                {actualAgentNames.map(agent => {
                                    const evalKey = `${agent}_${rIdx}`;
                                    const regressionHere = currentSwitches.some(s => s.agentName === agent && s.switchedToRound === rIdx);
                                    
                                    return (
                                        <AgentCard 
                                            key={evalKey}
                                            agentName={agent}
                                            response={round.responses[agent]}
                                            evaluation={evaluationResults[evalKey]}
                                            isRegressionPoint={regressionHere}
                                            defaultCollapsed={true} 
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
         </div>
      </main>
    </div>
  );
}