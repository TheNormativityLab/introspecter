"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Download,
  Activity,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Loader2,
  Terminal as TerminalIcon,
  ExternalLink,
} from "lucide-react";
import HumanInputModal from "./HumanInputModalProps";

interface Agent {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface DebateData {
  experimentName: string;
  totalQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: Agent[];
  selectedDatasets: string[];
  customQuestions: string[];
  isReplay?: boolean;
  existingDebateId?: string;
}

interface DebateInstance {
  id: string;
  dataset: string;
  datasets?: string[];
  seed: number;
  status: "idle" | "starting" | "running" | "completed" | "error";
  progress: number;
  currentQuestion: number;
  currentQuestionText?: string;
  currentRound: number;
  logs: string[];
  error: string | null;
  expanded: boolean;
  ws: WebSocket | null;
  humanInputData: any;
  showHumanInput: boolean;
  questionsForThisDataset?: number;
  resultsReady?: boolean;
}

interface ProgressMessage {
  type: string;
  debate_id?: string;
  message?: string;
  data?: any;
  timestamp: string;
  waiting_for_human?: boolean;
}

const DebateProgressMonitor = ({
  debateData,
  onBack,
  onBackDashboard,
}: {
  debateData: DebateData;
  onBack: () => void;
  onBackDashboard: () => void;
}) => {
  const [debates, setDebates] = useState<DebateInstance[]>([]);
  const [globalLogs, setGlobalLogs] = useState<{ msg: string; type: 'info' | 'error' | 'success'; time: string }[]>([]);
  const [showLogs, setShowLogs] = useState(true);  
  const [inputQueue, setInputQueue] = useState<number[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const hasInitializedOnceRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const loggedMessagesRef = useRef<{ [debateId: string]: Set<string> }>({});  
  const debatesRef = useRef(debates);

  useEffect(() => {
    debatesRef.current = debates;
  }, [debates]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [globalLogs]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!hasInitializedOnceRef.current) {
      hasInitializedOnceRef.current = true;
      initializeDebates();
    }
    return () => {
      isMountedRef.current = false;
      debatesRef.current.forEach(d => d.ws?.close());
    };
  }, []);

  useEffect(() => {
    const allFinished = debates.length > 0 && debates.every(
      d => d.status === 'completed' || d.status === 'error'
    );
    const allResultsReady = debates.length > 0 && debates.every(
      d => d.status !== 'completed' || d.resultsReady
    );
    if (allFinished && allResultsReady && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      setTimeout(() => navigateToResults(0), 1500); 
    }
  }, [debates]);

  const addLog = (message: string, debateIndex?: number, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const logString = `[${timestamp}] ${message}`;

    if (debateIndex !== undefined) {
      setDebates((prev) => {
        const next = [...prev];
        if (next[debateIndex]) {
            next[debateIndex] = {
            ...next[debateIndex],
            logs: [...next[debateIndex].logs, logString],
            };
        }
        return next;
      });
    }
    setGlobalLogs((prev) => [...prev, { msg: message, type, time: timestamp }]);
  };

  const addUniqueLog = (message: string, index?: number, debateId?: string, type: 'info' | 'error' | 'success' = 'info') => {
    if (debateId) {
      if (!loggedMessagesRef.current[debateId]) {
        loggedMessagesRef.current[debateId] = new Set();
      }
      if (loggedMessagesRef.current[debateId].has(message)) return;
      loggedMessagesRef.current[debateId].add(message);
    }
    addLog(message, index, type);
  };

  const updateDebate = (index: number, updates: Partial<DebateInstance>) => {
    setDebates((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...updates };
      }
      return next;
    });
  };

  const initializeDebates = async () => {
    if (debateData.isReplay && debateData.existingDebateId) {
      const instances: DebateInstance[] = [{
        id: debateData.existingDebateId,
        dataset: debateData.selectedDatasets?.[0] || "replay",
        datasets: debateData.selectedDatasets || ["replay"],
        seed: debateData.seeds?.[0] || 0,
        status: "idle",
        progress: 0,
        currentQuestion: 0,
        currentQuestionText: "",
        currentRound: 0,
        logs: [],
        error: null,
        expanded: true,
        ws: null,
        humanInputData: null,
        showHumanInput: false,
        questionsForThisDataset: debateData.totalQuestions,
      }];
      setDebates(instances);
      addLog(`Replaying debate ${debateData.existingDebateId.substring(0, 8)}`, 0, 'info');
      await new Promise((resolve) => setTimeout(resolve, 0));      
      connectWebSocket(0, debateData.existingDebateId);
      return;
    }

    const instances: DebateInstance[] = [];
    const hasCustomQuestions = (debateData.customQuestions || []).length > 0;
    const numCustomQuestions = hasCustomQuestions ? debateData.customQuestions.length : 0;
    const datasetsToRun = debateData.selectedDatasets?.filter((d) => d !== "custom_questions") || [];
    const questionsForDatasets = debateData.totalQuestions - numCustomQuestions;
    const questionsPerDataset = datasetsToRun.length > 0 
      ? Math.ceil(questionsForDatasets / datasetsToRun.length)
      : 0;

    const totalInstances = (datasetsToRun.length * debateData.seeds.length) + (hasCustomQuestions ? debateData.seeds.length : 0);
    const shouldAutoExpand = totalInstances === 1;

    datasetsToRun.forEach((dataset) => {
      debateData.seeds.forEach((seed) => {
        instances.push({
          id: "",
          dataset: dataset,
          datasets: [dataset],
          seed,
          status: "idle",
          progress: 0,
          currentQuestion: 0,
          currentQuestionText: "",
          currentRound: 0,
          logs: [],
          error: null,
          expanded: shouldAutoExpand,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: questionsPerDataset,
        });
      });
    });

    if (hasCustomQuestions) {
      debateData.seeds.forEach((seed) => {
        instances.push({
          id: "",
          dataset: "custom_questions",
          datasets: ["custom_questions"],
          seed,
          status: "idle",
          progress: 0,
          currentQuestion: 0,
          currentQuestionText: "",
          currentRound: 0,
          logs: [],
          error: null,
          expanded: shouldAutoExpand,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: numCustomQuestions,
        });
      });
    }

    setDebates(instances);
    addLog(`Initialized ${instances.length} instance(s)`, undefined, 'info');    
    await new Promise((resolve) => setTimeout(resolve, 100));
    triggerDebateInstance(0, instances);
  };

  const triggerDebateInstance = async (index: number, currentDebatesList?: DebateInstance[]) => {
    const debatesList = currentDebatesList || debatesRef.current;
    if (index >= debatesList.length) {
        addLog("All debate instances completed.", undefined, 'success');
        return;
    }

    if (!isMountedRef.current) return;

    const instance = debatesList[index];
    if (instance.status !== 'idle') return;

    updateDebate(index, { status: "starting", expanded: true });
    addLog(`Starting Instance ${index + 1}/${debatesList.length}: ${instance.dataset} (Seed ${instance.seed})`, index, 'info');

    try {
        const agentModels = debateData.agents?.filter((a) => a.enabled)?.map((a) => a.model) || [];
        const humanAgentIndex = agentModels.findIndex((model) => model === "human_participant");
        
        const isCustom = instance.dataset === "custom_questions";

        const payload: any = {
            debate_type: "basic_debate",
            task: isCustom ? "custom" : instance.dataset || "mmlu",
            num_questions: instance.questionsForThisDataset,
            num_rounds: debateData.numRounds,
            agent_models: agentModels,
            human_agent_index: humanAgentIndex >= 0 ? humanAgentIndex : null,
            seed: instance.seed,
            name: debateData.experimentName,
            summarize: true,
            selectedDatasets: [instance.dataset],
            custom_questions: isCustom ? debateData.customQuestions : undefined,
        };

        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

        const response = await fetch("/api/new-debate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!result.success || !result.debate_id) throw new Error(result.message || "Failed to start debate");

        updateDebate(index, { id: result.debate_id });
        addLog(`Instance created. ID: ${result.debate_id.substring(0, 6)}...`, index, 'success');
        connectWebSocket(index, result.debate_id);

    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateDebate(index, { status: "error", error: message });
        addLog(`Initialization Error: ${message}`, index, 'error');
        
        // IF ERROR, MOVE TO NEXT INSTANCE AUTOMATICALLY
        setTimeout(() => triggerDebateInstance(index + 1), 2000);
    }
  };

  const connectWebSocket = (index: number, debateId: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.hostname;
    const wsPort = process.env.NEXT_PUBLIC_API_PORT || "3001";
    const wsUrl = `${protocol}//${wsHost}:${wsPort}/ws/debates/${debateId}`;

    let ws: WebSocket;
    let shouldReconnect = true;
    let pingInterval: NodeJS.Timeout;
    let hasSeenConnected = false;

    const initWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);
        updateDebate(index, { ws });

        ws.onopen = () => {
          updateDebate(index, { status: "running" });
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
          }, 30000);          
        };

        ws.onmessage = (event) => {
          try {
            const message: ProgressMessage = JSON.parse(event.data);            
            if (message.type === "connected" && !hasSeenConnected) {
              hasSeenConnected = true;              
              const hasHumanAgent = debateData.agents?.some(a => a.enabled && a.model === "human_participant");
              const backendWaiting = message.waiting_for_human || message.data?.waiting_for_human;
              
              if (hasHumanAgent || backendWaiting) {
                  setTimeout(async () => {
                      try {
                          await fetch(`/api/debate/${debateId}/human-ready`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                          });
                          addLog("Human ready signal sent", index, 'info');
                      } catch (e) { console.error("Error sending human-ready:", e); }
                  }, 500);
              }
            }

            if (["debate_completed", "debate_error", "debate_cancelled"].includes(message.type)) {
              shouldReconnect = false;
              clearInterval(pingInterval);
            }
            handleMessage(index, message, debateId);
          } catch (err) { console.error("WS Parse Error", err); }
        };

        ws.onclose = (event) => {
          clearInterval(pingInterval);
          if (shouldReconnect) {
             setDebates(current => {
                 if (current[index]?.status !== "completed" && current[index]?.status !== "error") {
                     setTimeout(() => initWebSocket(), 2000);
                 }
                 return current;
             });
          }
        };
      } catch (err) { addLog(`WS Error: ${err}`, index, 'error'); }
    };
    initWebSocket();
  };

  const handleMessage = (index: number, msg: ProgressMessage, debateId?: string) => {
    const currentDebate = debatesRef.current[index];

    switch (msg.type) {
      case "debate_started":
        updateDebate(index, { status: "running" });
        break;
      case "question_started":
        const qIndex = (msg.data?.question_index ?? 0) + 1;
        updateDebate(index, {
          currentQuestion: qIndex,
          currentQuestionText: msg.data?.question_text || msg.data?.question || "",
        });
        addLog(`Started Question ${qIndex}`, index, 'info');
        break;
      case "round_completed":
        const roundNum = (msg.data?.round_number ?? 0) + 1;
        setDebates((prev) => {
          const debate = prev[index];
          const actualQ = msg.data?.question_index !== undefined 
            ? (msg.data.question_index + 1) 
            : debate.currentQuestion || 1;
          const isLastRound = roundNum >= debateData.numRounds;
          const questionsDone = isLastRound ? actualQ : Math.max(0, actualQ - 1);
          const total = debate.questionsForThisDataset || debateData.totalQuestions;
          const newProgress = total > 0 ? Math.min(100, (questionsDone / total) * 100) : 0;
          
          addLog(`Round ${roundNum} completed (Q${actualQ})`, index, 'info');
          
          return [
            ...prev.slice(0, index),
            { 
              ...debate, 
              currentRound: roundNum, 
              currentQuestion: actualQ,
              progress: newProgress 
            },
            ...prev.slice(index + 1),
          ];
        });
        break;
      case "round_started":
        const startRound = (msg.data?.round_number ?? 0) + 1;
        updateDebate(index, { currentRound: startRound });
        addLog(`Round ${startRound} started`, index, 'info');
        break;
      case "waiting_for_human":
        const humanQText = msg.data?.question_text || currentDebate?.currentQuestionText || "";
        const prevResps = Object.entries(msg.data?.other_responses || {}).map(([k, v]) => `${k}: ${v}`);        
        const modalData = {
            ...msg.data,
            question_text: humanQText,
            previous_responses: prevResps, 
        };
        
        updateDebate(index, {
          humanInputData: modalData,
          showHumanInput: true,
        });

        // Add to Queue (safety net)
        setInputQueue((prev) => {
            if (prev.includes(index)) return prev;
            return [...prev, index];
        });

        addLog("Action Required: Human Input", index, 'info');
        break;
      case "debate_completed":
      case "question_completed":
        const isFullyComplete = msg.type === "debate_completed";
        const questionComplete = msg.type === "question_completed";
        const totalQ = currentDebate?.questionsForThisDataset || debateData.totalQuestions;
        const currentQ = (msg.data?.question_index || 0) + 1;
        
        if (questionComplete) {
          addLog(`Question ${currentQ} finished`, index, 'success');
          updateDebate(index, { 
            currentQuestion: currentQ,
            progress: Math.min(100, (currentQ / totalQ) * 100) 
          });
        }
        
        if (isFullyComplete || (questionComplete && currentQ >= totalQ)) {
          const finalId = msg.debate_id || debateId || currentDebate?.id;
          updateDebate(index, { 
            status: "completed", 
            progress: 100,
            currentQuestion: totalQ,
            currentRound: debateData.numRounds
          });
          addLog(`Debate completed! (${currentQ}/${totalQ} questions)`, index, 'success');
          
          if (finalId) setTimeout(() => fetchDebateResults(index, finalId), 1000);
          if (isFullyComplete) {
              setTimeout(() => {
                  triggerDebateInstance(index + 1);
              }, 1000);
          }
        }
        break;
      case "debate_error":
        const errorMsg = msg.message || msg.data?.error || "Unknown error";
        updateDebate(index, { status: "error", error: errorMsg });
        addLog(`Runtime Error: ${errorMsg}`, index, 'error');        
        setTimeout(() => triggerDebateInstance(index + 1), 2000);
        break;
    }
  };
  
  const fetchDebateResults = async (index: number, debateId: string, retryCount = 0) => {
    if (!debateId) return;
    let alreadyFetched = false;
    setDebates((prev) => {
        if (prev[index]?.resultsReady) alreadyFetched = true;
        return prev;
    });
    if (alreadyFetched) return;

    try {
      const response = await fetch(`/api/debate/${debateId}/results`);
      if (!response.ok) {
          if (response.status === 404 && retryCount < 5) {
              setTimeout(() => fetchDebateResults(index, debateId, retryCount + 1), 2000);
              return;
          }
          throw new Error(`HTTP ${response.status}`);
      }
      await response.json(); 
      addUniqueLog("Final results stored", index, debateId, 'success');      
      updateDebate(index, { resultsReady: true });
    } catch (error) {
        if (retryCount < 5) {
            setTimeout(() => fetchDebateResults(index, debateId, retryCount + 1), 2000);
        } else {
            addLog(`Error fetching results: ${error}`, index, 'error');
        }
    }
  };

  const navigateToResults = (index: number) => {
      const debate = debatesRef.current[index];
      if (!debate) return;
      const baseName = debateData.experimentName.startsWith('replay_') 
          ? debateData.experimentName 
          : debateData.isReplay 
              ? `replay_${debateData.experimentName}`
              : debateData.experimentName;
      const encodedName = encodeURIComponent(baseName);
      window.location.href = `/debate/${encodedName}?seed=${debate.seed}`;
  };

  const handleHumanResponse = async (index: number, response: string, extracted: string) => {
    const debate = debatesRef.current[index];
    if (!debate.id) return;
    try {
      const res = await fetch(`/api/debate/${debate.id}/human-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_text: response, extracted_answer: extracted }),
      });
      const data = await res.json();
      if (data.success) {
        addLog("Response submitted", index, 'success');        
        setInputQueue((prev) => prev.filter(i => i !== index));
        updateDebate(index, { showHumanInput: false, humanInputData: null });
      } else throw new Error(data.message);
    } catch (error) { addLog(`Submission Error: ${error}`, index, 'error'); }
  };

  const downloadLogs = () => {
    const content = globalLogs.map(l => `[${l.time}] ${l.msg}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
      running: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
      error: "bg-red-100 text-red-700 border-red-200",
      starting: "bg-amber-100 text-amber-700 border-amber-200",
      idle: "bg-slate-100 text-slate-600 border-slate-200"
    };
    const icons: Record<string, React.ReactNode> = {
        completed: <CheckCircle2 size={12} />,
        running: <Activity size={12} />,
        error: <AlertCircle size={12} />,
        starting: <Clock size={12} />,
        idle: <MoreHorizontal size={12} />
    };
    return (
      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${styles[status] || styles.idle}`}>
        {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const completed = debates.filter((d) => d.status === "completed").length;
  const overallProgress = debates.length > 0 ? debates.reduce((sum, d) => sum + d.progress, 0) / debates.length : 0;
  
  const activeInputIndex = inputQueue.length > 0 ? inputQueue[0] : -1;

  return (
    <div className="fixed inset-0 z-50 bg-[#f8fafc] text-slate-800 font-sans overflow-hidden flex flex-col">
      {activeInputIndex !== -1 && (
        <HumanInputModal
          key={activeInputIndex}
          isOpen={true}
          questionData={debates[activeInputIndex]?.humanInputData}
          onSubmit={(text, extracted) => handleHumanResponse(activeInputIndex, text, extracted)}
          onClose={() => updateDebate(activeInputIndex, { showHumanInput: false })}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 w-full h-full relative">        
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 flex-shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-all">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">{debateData.experimentName}</h1>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                       <span>{debates.length} Instance{debates.length !== 1 && 's'}</span>
                       <span className="w-1 h-1 bg-slate-300 rounded-full"/>
                       <span>{debateData.seeds.length} Seed{debateData.seeds.length !== 1 && 's'}</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setShowLogs(!showLogs)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        showLogs ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <TerminalIcon size={16} />
                    {showLogs ? 'Hide Logs' : 'Show Logs'}
                </button>
                <button onClick={downloadLogs} className="p-2 text-slate-400 hover:text-slate-600">
                    <Download size={18} />
                </button>
            </div>
        </header>

        <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col justify-center flex-shrink-0">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-600 mb-2">
                <span className="flex items-center gap-2">
                    {overallProgress === 100 ? <CheckCircle2 className="text-emerald-500" size={14}/> : <Loader2 className="animate-spin text-blue-500" size={14}/>}
                    {overallProgress === 100 ? "Complete" : "Running Experiment..."}
                </span>
                <span>{Math.round(overallProgress)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out ${overallProgress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                    style={{ width: `${overallProgress}%` }}
                />
            </div>
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">            
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                <div className={debates.length === 1 ? "max-w-3xl mx-auto" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}>
                    {debates.map((debate, i) => (
                        <div 
                            key={i} 
                            onClick={() => updateDebate(i, { expanded: !debate.expanded })}
                            className={`bg-white rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden hover:shadow-md ${
                                debate.status === 'running' ? 'border-blue-400 ring-1 ring-blue-100' : 
                                debate.status === 'error' ? 'border-red-200' : 'border-slate-200'
                            }`}
                        >
                            <div className="p-4 border-b border-slate-50 flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-slate-800 text-sm mb-1">{debate.dataset}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">Seed {debate.seed}</span>
                                        {debate.status === 'running' && (
                                            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                                <Activity size={10} className="animate-pulse"/> Running
                                            </span>
                                        )}
                                        {debate.status === 'idle' && (
                                            <span className="text-[10px] text-slate-400 italic">Waiting...</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>Questions</span>
                                    <span className="font-mono text-slate-800">{debate.currentQuestion} / {debate.questionsForThisDataset || debateData.totalQuestions}</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>Current Round</span>
                                    <span className="font-mono text-slate-800">{debate.currentRound} / {debateData.numRounds}</span>
                                </div>
                                
                                <div className="w-full bg-slate-100 rounded-full h-1 mt-2">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            debate.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                                        }`} 
                                        style={{ width: `${debate.progress}%` }} 
                                    />
                                </div>
                            </div>

                            {debate.expanded && (
                                <div className="bg-slate-50 p-3 border-t border-slate-100 max-h-48 overflow-y-auto">
                                    {debate.logs.length === 0 ? (
                                        <p className="text-[10px] text-slate-400 italic">No logs yet...</p>
                                    ) : (
                                        debate.logs.slice().reverse().map((log, k) => (
                                            <div key={k} className="text-[10px] font-mono text-slate-500 truncate mb-1">
                                                {log.split(']').pop()}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {showLogs && (
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 transition-all duration-300">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Activity Feed</h3>
                        <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono">
                            {globalLogs.length}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-slate-200">
                        {globalLogs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                <Activity size={24} className="opacity-20" />
                                <span className="text-xs">Waiting for activity...</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {globalLogs.map((log, i) => (
                                    <div key={i} className="p-3 hover:bg-slate-50 transition-colors flex gap-3 group">
                                        <div className="mt-0.5 flex-shrink-0">
                                            {log.type === 'error' ? (
                                                <div className="w-2 h-2 rounded-full bg-red-500"/>
                                            ) : log.type === 'success' ? (
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"/>
                                            ) : (
                                                <div className="w-2 h-2 rounded-full bg-blue-400"/>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs leading-relaxed break-words ${
                                                log.type === 'error' ? 'text-red-600 font-medium' : 
                                                log.type === 'success' ? 'text-emerald-700 font-medium' : 'text-slate-600'
                                            }`}>
                                                {log.msg}
                                            </p>
                                            <p className="text-[10px] text-slate-300 group-hover:text-slate-400 mt-1 font-mono">{log.time}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default DebateProgressMonitor;