"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  LayoutGrid,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Gavel,
  Clock,
  Play,
  Bug,
  RefreshCw,
  Filter,
  User,
  Brain,
  ArrowLeft
} from "lucide-react";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";

interface LLMConfig {
  id: number;
  modelName: string;
  model: string;
}

interface DebateRun {
  debate_id?: number;
  seed: number;
  dataset_name: string;
  status: string;
  wandb_metadata: any;
  processed_at: string;
  is_replay?: boolean;
}

interface ExperimentGroup {
  experiment_name: string;
  model_config: { LLM: LLMConfig[] };
  runs: DebateRun[];
}

interface Debate {
  debate_id?: number;
  experiment_name?: string;
  name: string;
  created_at: string;
  config: any;
  seed: number;
  dataset_name: string;
  status: string;
  uniqueId: string;
}

interface Question {
  question: string;
  question_prompt: string;
  correct_answer: string;
  debate_session: {
    rounds: {
      responses: { [agent: string]: string };
    }[];
  };
}

interface DebateDetails {
  questions: Question[];
}


export default function DebateDebuggerPage() {
  const router = useRouter();
  const [debates, setDebates] = useState<Debate[]>([]);
  const [debateDetails, setDebateDetails] = useState<DebateDetails | null>(null);
  const [selectedDebate, setSelectedDebate] = useState<Debate | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [agentToReplace, setAgentToReplace] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [monitorConfig, setMonitorConfig] = useState<any>(null);

  useEffect(() => {
    fetchCompletedDebates();
  }, []);

  const fetchCompletedDebates = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/all-debates");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      
      const allDebates: Debate[] = [];
      if (data.experiment_groups) {
        data.experiment_groups.forEach((group: ExperimentGroup) => {
          group.runs.forEach((run: DebateRun) => {
            const isReplay = run.is_replay || group.experiment_name?.toLowerCase().includes('replay');
            const hasHuman = group.model_config?.LLM?.some(m => m.model.includes('human'));
            
            if (run.status === "completed" && !isReplay && !hasHuman) {
              allDebates.push({
                debate_id: run.debate_id,
                experiment_name: group.experiment_name,
                name: `${group.experiment_name}`,
                created_at: run.processed_at,
                config: { ...group.model_config, seed: run.seed },
                seed: run.seed,
                dataset_name: run.dataset_name,
                status: run.status,
                uniqueId: run.debate_id ? `db-${run.debate_id}` : `exp-${group.experiment_name}-${run.seed}`
              });
            }
          });
        });
      }
      setDebates(allDebates);
    } catch (err) {
      console.error(err);
      setError("Failed to load debate list.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDebate = async (debate: Debate) => {
    setSelectedDebate(debate);
    setDebateDetails(null);
    setSelectedQuestion(null);
    setSelectedRound(0);
    setAgentToReplace(null);
    setDetailsLoading(true);

    try {
      if (debate.debate_id) {
        const res = await fetch(`/api/debate-run?debateId=${debate.debate_id}`);
        const data = await res.json();
        if (data.success && data.run_details?.result_data) {
           let result = data.run_details.result_data;
           if (typeof result === 'string') result = JSON.parse(result);
           setDebateDetails(Array.isArray(result) ? { questions: result } : result);
           if (result.length > 0) setSelectedQuestion(0);
           setDetailsLoading(false);
           return;
        }
      }

      const res = await fetch(`/api/single-debate?experimentName=${encodeURIComponent(debate.experiment_name || "")}&seed=${debate.seed}`);
      const data = await res.json();
      if (data.runs?.[0]?.result_data) {
         let result = data.runs[0].result_data;
         if (typeof result === 'string') result = JSON.parse(result);
         setDebateDetails(Array.isArray(result) ? { questions: result } : result);
         if (result.length > 0) setSelectedQuestion(0);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load debate details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleStartReplay = async () => {
    if (!selectedDebate || selectedQuestion === null || agentToReplace === null || !debateDetails) return;

    setLoading(true);
    setError(null);
    try {
        const questionData = debateDetails.questions[selectedQuestion];
        const agentsList = Object.keys(questionData.debate_session.rounds[0].responses);
        const selectedAgentName = agentsList[agentToReplace];
        const agent_counts: Record<string, number> = {};
        agentsList.forEach(a => { agent_counts[a] = (agent_counts[a] || 0) + 1 });

        const previousRounds = questionData.debate_session.rounds.slice(0, selectedRound).map(r => ({ responses: r.responses }));

        const llmConf = selectedDebate.config?.LLM || [];
        
        const payload = {
            original_debate_id: selectedDebate.debate_id,
            question_index: selectedQuestion,
            start_from_round: selectedRound,
            replace_agent_name: selectedAgentName,
            question_data: {
                question_text: questionData.question,
                question_prompt: questionData.question_prompt,
                correct_answer: questionData.correct_answer,
            },
            previous_rounds: previousRounds,
            original_config: {
                ...selectedDebate.config,
                experiment_name: selectedDebate.experiment_name || selectedDebate.name,
                seed: selectedDebate.seed,
                dataset_name: selectedDebate.dataset_name,
                num_rounds: questionData.debate_session.rounds.length,
                agent_counts: agent_counts,
                llm_conf: llmConf.length > 0 ? llmConf : undefined,
                wandb_metadata: selectedDebate.config?.wandb_metadata
            }
        };

        const res = await fetch("/api/debate/replay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success && result.debate_id) {
            const replayAgents = agentsList.map((agentName, idx) => ({
                id: agentName,
                name: agentName,
                model: idx === agentToReplace ? "human-participant" : agentName,
                enabled: true,
                isHuman: idx === agentToReplace
            }));

            setMonitorConfig({
                experimentName: result.experiment_name || selectedDebate.experiment_name || selectedDebate.name,
                totalQuestions: 1,
                numRounds: questionData.debate_session.rounds.length,
                seeds: [selectedDebate.seed],
                agents: replayAgents,
                selectedDatasets: [selectedDebate.dataset_name],
                isReplay: true,
                existingDebateId: result.debate_id
            });
            setShowMonitor(true);
        } else {
            setError(result.message || "Failed to start replay");
        }
    } catch (e) {
        console.error(e);
        setError("Failed to start replay.");
    } finally {
        setLoading(false);
    }
  };

  const filteredDebates = debates.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.dataset_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentQuestionData = selectedQuestion !== null && debateDetails ? debateDetails.questions[selectedQuestion] : null;
  const numRounds = currentQuestionData?.debate_session.rounds.length || 0;
  const currentAgents = currentQuestionData?.debate_session.rounds[0].responses ? Object.keys(currentQuestionData.debate_session.rounds[0].responses) : [];

  if (showMonitor && monitorConfig) {
    return (
      <DebateProgressMonitor 
        debateData={monitorConfig}
        onBack={() => {
          setShowMonitor(false);
          setMonitorConfig(null);
        }}
        onBackDashboard={() => router.push('/dashboard')}
      />
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-md cursor-pointer" onClick={() => router.push('/dashboard')}>
           <ArrowLeft size={20} />
        </button>

        <nav className="flex flex-col gap-3 w-full px-2">
          
          <button className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group">
            <LayoutGrid size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Dashboard
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate-annotation')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <FileText size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Debate Annotation
            </span>
          </button>
          
          <button 
            onClick={() => router.push('/argumentative-debate')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <Gavel size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Argumentative Debate
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate/new')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <MessageSquare size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Basic Debate
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate/debug')} 
            className="p-3 rounded-xl bg-blue-50 text-blue-600 transition-colors relative group"
          >
            <Bug size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Debug
            </span>
          </button>
        </nav>
      </aside>

      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col z-20 flex-shrink-0">
        <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <Filter size={12} /> Completed Debates
                </div>
                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{debates.length}</span>
            </div>
            <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                    type="text" 
                    placeholder="Search Experiment Name..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-transparent hover:bg-slate-100 focus:bg-white focus:border-blue-500 rounded-lg text-sm transition-all outline-none"
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {loading && debates.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center">
                    <RefreshCw className="animate-spin mb-2" size={20} /> Loading...
                </div>
            ) : filteredDebates.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No debates found.</div>
            ) : (
                filteredDebates.map((debate) => (
                    <div 
                        key={debate.uniqueId}
                        onClick={() => handleSelectDebate(debate)}
                        className={`px-5 py-4 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 group relative ${
                            selectedDebate?.uniqueId === debate.uniqueId ? 'bg-blue-50/60' : ''
                        }`}
                    >
                        {selectedDebate?.uniqueId === debate.uniqueId && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                        <div className="flex justify-between items-start mb-1.5">
                            <span className={`font-semibold text-sm truncate pr-2 ${selectedDebate?.uniqueId === debate.uniqueId ? 'text-blue-900' : 'text-slate-700'}`}>
                                {debate.name}
                            </span>
                            <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2.5">
                            <Clock size={10} /> {new Date(debate.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600 uppercase">
                                {debate.dataset_name}
                            </span>
                            <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600">
                                Seed {debate.seed}
                            </span>
                        </div>
                    </div>
                ))
            )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc]">
        
        <header className="px-8 py-5 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div>
                <h1 className="text-xl font-bold text-slate-900">Debate Debugger</h1>
                <p className="text-sm text-slate-500 mt-0.5">Replay completed debates with human intervention.</p>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative">
            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center gap-3">
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {!selectedDebate ? (
                <div className="flex flex-col items-center justify-center h-full text-center pb-20">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                        <LayoutGrid size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Select a Debate</h3>
                    <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                        Choose a completed debate from the sidebar to configure a human intervention replay.
                    </p>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Selected Run</div>
                            <h2 className="text-lg font-bold text-slate-900">{selectedDebate.name}</h2>
                            <p className="text-sm text-slate-500 font-mono mt-1">ID: {selectedDebate.debate_id || "External"}</p>
                        </div>
                        {detailsLoading && <RefreshCw className="animate-spin text-blue-500" />}
                    </div>

                    {debateDetails && (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <h3 className="font-semibold text-slate-700">1. Select Question</h3>
                                <span className="text-xs font-mono text-slate-400">{debateDetails.questions.length} Questions</span>
                            </div>
                            <div className="p-6">
                                {selectedQuestion !== null && (
                                    <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900 leading-relaxed">
                                        <span className="font-bold block mb-1 text-blue-700">Preview:</span>
                                        {debateDetails.questions[selectedQuestion].question}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                    {debateDetails.questions.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => { setSelectedQuestion(idx); setSelectedRound(0); setAgentToReplace(null); }}
                                            className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${
                                                selectedQuestion === idx 
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            {idx + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedQuestion !== null && currentQuestionData && (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="font-semibold text-slate-700">2. Select Starting Round</h3>
                            </div>
                            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {Array.from({ length: numRounds }, (_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedRound(i)}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            selectedRound === i
                                            ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className={`text-xs font-bold uppercase mb-1 ${selectedRound === i ? 'text-blue-600' : 'text-slate-400'}`}>Round {i}</div>
                                        <div className={`text-sm ${selectedRound === i ? 'text-blue-900 font-medium' : 'text-slate-600'}`}>
                                            {i === 0 ? "Start Fresh" : "Resume"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedQuestion !== null && selectedRound !== null && currentAgents.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="font-semibold text-slate-700">3. Select Agent to Replace</h3>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                {currentAgents.map((agent, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setAgentToReplace(i)}
                                        className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${
                                            agentToReplace === i
                                            ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                            agentToReplace === i ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {agentToReplace === i ? <User size={20} /> : <Brain size={20} />}
                                        </div>
                                        <div className="text-left">
                                            <div className={`font-bold text-sm ${agentToReplace === i ? 'text-indigo-900' : 'text-slate-700'}`}>{agent}</div>
                                            <div className="text-xs text-slate-500">
                                                {agentToReplace === i ? "Human (You)" : "AI Model"}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {agentToReplace !== null && (
                        <div className="pt-4 pb-8">
                            <button
                                onClick={handleStartReplay}
                                disabled={loading}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <RefreshCw className="animate-spin" /> : <Play className="fill-current" />}
                                Start Human-in-the-Loop Session
                            </button>
                        </div>
                    )}

                </div>
            )}
        </div>

      </main>
    </div>
  );
}