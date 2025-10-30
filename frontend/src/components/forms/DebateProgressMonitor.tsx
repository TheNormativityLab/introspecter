"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowLeft,
  Brain,
  User,
  RefreshCw,
  Download,
  Terminal,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/button/Button";
import HumanInputModal from "./HumanInputModalProps";
import "./DebateProgressMonitor.scss";

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
}

interface ProgressMessage {
  type: string;
  debate_id?: string;
  message?: string;
  data?: any;
  timestamp: string;
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
  const [globalLogs, setGlobalLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const hasInitializedOnceRef = useRef(false);
  const loggedMessagesRef = useRef<{ [debateId: string]: Set<string> }>({});

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [globalLogs]);

  useEffect(() => {
    isMountedRef.current = true;
    console.log({
      customQuestions: debateData.customQuestions,
      selectedDatasets: debateData.selectedDatasets,
      seeds: debateData.seeds,
      isReplay: debateData.isReplay,
      existingDebateId: debateData.existingDebateId,
    });
    if (!hasInitializedOnceRef.current) {
      hasInitializedOnceRef.current = true;
      initializeDebates();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const addLog = (message: string, debateIndex?: number) => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${message}`;

    if (debateIndex !== undefined) {
      setDebates((prev) => {
        const next = [...prev];
        next[debateIndex] = {
          ...next[debateIndex],
          logs: [...next[debateIndex].logs, log],
        };
        return next;
      });
    }

    setGlobalLogs((prev) => [...prev, log]);
  };

  const addUniqueLog = (message: string, index?: number, debateId?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${message}`;

    if (debateId) {
      if (!loggedMessagesRef.current[debateId]) {
        loggedMessagesRef.current[debateId] = new Set();
      }
      if (loggedMessagesRef.current[debateId].has(message)) return;
      loggedMessagesRef.current[debateId].add(message);
    }

    addLog(message, index);
  };

  const updateDebate = (index: number, updates: Partial<DebateInstance>) => {
    setDebates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const initializeDebates = async () => {
    if (debateData.isReplay && debateData.existingDebateId) {
      console.log("Monitoring existing replay debate:", debateData.existingDebateId);
      
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
        expanded: false,
        ws: null,
        humanInputData: null,
        showHumanInput: false,
        questionsForThisDataset: debateData.totalQuestions,
      }];
      
      setDebates(instances);
      addLog(`Monitoring replay debate ${debateData.existingDebateId.substring(0, 8)}`);
      
      await new Promise((resolve) => setTimeout(resolve, 0));      
      connectWebSocket(0, debateData.existingDebateId);
      await waitForCompletion(0);
      return;
    }

    // Original logic for non-replay debates
    const instances: DebateInstance[] = [];
    console.log("Debug initializeDebates:");
    console.log("  - selectedDatasets:", debateData.selectedDatasets);
    console.log("  - customQuestions:", debateData.customQuestions);
    console.log("  - totalQuestions:", debateData.totalQuestions);

    const hasCustomQuestions = (debateData.customQuestions || []).length > 0;
    const numCustomQuestions = hasCustomQuestions ? debateData.customQuestions.length : 0;
    const shouldRunCustomQuestions = hasCustomQuestions;
    const datasetsToRun =
      debateData.selectedDatasets?.filter((d) => d !== "custom_questions") ||
      [];
    const questionsForDatasets = debateData.totalQuestions - numCustomQuestions;
    const questionsPerDataset = datasetsToRun.length > 0 
      ? Math.ceil(questionsForDatasets / datasetsToRun.length)
      : 0;

    console.log("Question distribution:");
    console.log("  - Total questions:", debateData.totalQuestions);
    console.log("  - Custom questions:", numCustomQuestions);
    console.log("  - Questions for datasets:", questionsForDatasets);
    console.log("  - Datasets to run:", datasetsToRun);
    console.log("  - Questions per dataset:", questionsPerDataset);

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
          expanded: false,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: questionsPerDataset,
        });
      });
    });

    if (shouldRunCustomQuestions) {
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
          expanded: false,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: numCustomQuestions,
        });
      });
      console.log(
        "Added custom_questions instances:",
        numCustomQuestions
      );
    }

    setDebates(instances);
    addLog(
      `Initialized ${instances.length} debate(s) across ${
        datasetsToRun.length + (shouldRunCustomQuestions ? 1 : 0)
      } dataset(s)`
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    await startDebateInstances();
  };

  const startDebateInstances = async () => {
    console.log("Replay Params:", debateData?.isReplay, debateData?.existingDebateId);
    if (debateData.isReplay && debateData.existingDebateId) {
      console.log("Skipping startDebateInstances - this is a replay");
      return;
    }
    
    const instances: DebateInstance[] = [];
    console.log("Debug startDebateInstances:");
    console.log("  - selectedDatasets:", debateData.selectedDatasets);
    console.log("  - customQuestions:", debateData.customQuestions);
    console.log("  - totalQuestions:", debateData.totalQuestions);

    const hasCustomQuestions = (debateData.customQuestions || []).length > 0;
    const numCustomQuestions = hasCustomQuestions ? debateData.customQuestions.length : 0;
    const shouldRunCustomQuestions = hasCustomQuestions;
    const datasetsToRun = debateData.selectedDatasets?.filter((d) => d !== "custom_questions") || [];
    const questionsForDatasets = debateData.totalQuestions - numCustomQuestions;
    const questionsPerDataset =
      datasetsToRun.length > 0 ? Math.ceil(questionsForDatasets / datasetsToRun.length) : 0;

    console.log("Question distribution:");
    console.log("  - Total questions:", debateData.totalQuestions);
    console.log("  - Custom questions:", numCustomQuestions);
    console.log("  - Questions for datasets:", questionsForDatasets);
    console.log("  - Datasets to run:", datasetsToRun);
    console.log("  - Questions per dataset:", questionsPerDataset);

    // Create debate instances for datasets
    datasetsToRun.forEach((dataset) => {
      debateData.seeds.forEach((seed) => {
        instances.push({
          id: "",
          dataset,
          datasets: [dataset],
          seed,
          status: "idle",
          progress: 0,
          currentQuestion: 0,
          currentQuestionText: "",
          currentRound: 0,
          logs: [],
          error: null,
          expanded: false,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: questionsPerDataset,
        });
      });
    });

    // Add custom question debates if any
    if (shouldRunCustomQuestions) {
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
          expanded: false,
          ws: null,
          humanInputData: null,
          showHumanInput: false,
          questionsForThisDataset: numCustomQuestions,
        });
      });
      console.log("Added custom_questions instances:", numCustomQuestions);
    }

    // Store initialized debates in state
    setDebates(instances);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Start each debate sequentially
    for (let i = 0; i < instances.length; i++) {
      if (!isMountedRef.current) break;

      const debate = instances[i];
      updateDebate(i, { status: "starting" });
      addLog(`Starting ${debate.dataset} (seed: ${debate.seed})`, i);

      try {
        const isCustomQuestions = debate.datasets?.includes("custom_questions");
        const agentModels =
          debateData.agents?.filter((a) => a.enabled)?.map((a) => a.model) || [];

        console.log("Agent extraction:", {
          rawAgents: debateData.agents,
          enabledAgents: debateData.agents?.filter((a) => a.enabled),
          agentModels,
        });

        if (agentModels.length === 0) {
          throw new Error("At least 1 agent is required. Please enable at least one agent.");
        }

        const humanAgentIndex = agentModels.findIndex((model) => model === "human-participant");
        const numQuestionsForThisInstance =
          debate.questionsForThisDataset || debateData.totalQuestions;

        const payload: any = {
          debate_type: "basic_debate",
          task: isCustomQuestions ? "custom" : debate.dataset || "mmlu",
          num_questions: numQuestionsForThisInstance,
          num_rounds: debateData.numRounds,
          agent_models: agentModels,
          human_agent_index: humanAgentIndex >= 0 ? humanAgentIndex : null,
          seed: debate.seed,
          name: debateData.experimentName,
          summarize: true,
          selectedDatasets: debate.datasets || [debate.dataset],
          custom_questions: isCustomQuestions ? debateData.customQuestions : undefined,
        };


        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

        console.log("Sending debate request:", {
          endpoint: "/api/new-debate",
          task: payload.task,
          seed: payload.seed,
          selectedDatasets: payload.selectedDatasets,
          hasCustomQuestions: !!payload.custom_questions?.length,
          numCustomQuestions: payload.custom_questions?.length || 0,
          customQuestionsPreview: payload.custom_questions?.[0],
          agentModels: payload.agent_models,
          numAgents: payload.agent_models.length,
          numQuestions: payload.num_questions,
        });

        const response = await fetch("/api/new-debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!result.success || !result.debate_id) {
          throw new Error(result.message || "Failed to start debate");
        }

        updateDebate(i, { id: result.debate_id });
        addLog(`Created debate ${result.debate_id.substring(0, 8)}`, i);
        addLog("Connecting WebSocket...", i);

        connectWebSocket(i, result.debate_id);
        await waitForCompletion(i);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateDebate(i, { status: "error", error: message });
        addLog(`Error: ${message}`, i);
      }
    }
  };

  const connectWebSocket = (index: number, debateId: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.hostname;
    const wsPort = process.env.NEXT_PUBLIC_API_PORT || "3001";
    const wsUrl = `${protocol}//${wsHost}:${wsPort}/ws/debates/${debateId}`;

    console.log("🔌 Connecting to WebSocket:", wsUrl);
    addLog(`Connecting to: ${wsUrl}`, index);

    let ws: WebSocket;
    let shouldReconnect = true;
    let pingInterval: NodeJS.Timeout;
    let hasSeenConnected = false;

    const initWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);
        updateDebate(index, { ws });

        ws.onopen = () => {
          addLog("WebSocket connected", index);
          console.log("WebSocket OPEN");
          updateDebate(index, { status: "running" });

          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 30000);          
        };

        ws.onmessage = (event) => {
          try {
            const message: ProgressMessage = JSON.parse(event.data);
            console.log("WS Message:", message.type, message);
            if (message.type === "connected" && !hasSeenConnected) {
              hasSeenConnected = true;              
              const hasHumanAgent = debateData.agents?.some(
                agent => agent.enabled && agent.model === "human-participant"
              );
              console.log("Has human agent:", hasHumanAgent, "| Is replay:", debateData.isReplay);
              if (hasHumanAgent || debateData.isReplay) {
                setTimeout(async () => {
                  try {
                    console.log("Sending human-ready signal for debate:", debateId);
                    const response = await fetch(`/api/debate/${debateId}/human-ready`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                    });
                    
                    if (response.ok) {
                      console.log("Ready signal sent successfully");
                      addLog("Ready signal sent", index);
                    } else {
                      console.error("Failed to send ready signal:", response.status);
                      addLog("Failed to send ready signal", index);
                    }
                  } catch (err) {
                    console.error("Error sending human-ready signal:", err);
                    addLog(`Error sending ready signal: ${err}`, index);
                  }
                }, 500);
              } else {
                const reason = debateData.isReplay ? "replay mode" : "no human agent";
                console.log(`Skipping ready signal - ${reason}`);
              }
            }
            if (
              ["debate_completed", "debate_error", "debate_cancelled"].includes(
                message.type
              )
            ) {
              shouldReconnect = false;
              clearInterval(pingInterval);
            }
            handleMessage(index, message, debateId);
          } catch (err) {
            console.error("Failed to parse WS message:", err, event.data);
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
        };

        ws.onclose = (event) => {
          clearInterval(pingInterval);
          addLog(`WebSocket closed (code: ${event.code})`, index);
          const debate = debates[index];
          if (!shouldReconnect || debate?.status === "completed") return;

          addLog("Reconnecting in 2s...", index);
          setTimeout(() => initWebSocket(), 2000);
        };
      } catch (err) {
        console.error("Error creating WebSocket:", err);
        addLog(`Failed to create WebSocket: ${err}`, index);
      }
    };

    initWebSocket();
  };
  const handleMessage = (
    index: number,
    msg: ProgressMessage,
    debateId?: string
  ) => {
    switch (msg.type) {
      case "debate_started":
        updateDebate(index, { status: "running" });
        addLog("Debate started", index);
        break;
      
      case "connected":
        addLog("WebSocket connection confirmed", index);
        break;
      case "question_started":
        const qNum = (msg.data?.question_index || 0) + 1;
        const questionText =
          msg.data?.question_text || msg.data?.question || "";
        updateDebate(index, {
          currentQuestion: qNum,
          currentQuestionText: questionText,
        });
        
        const totalForThisDebate = debates[index]?.questionsForThisDataset || debateData.totalQuestions;
        addLog(`Question ${qNum}/${totalForThisDebate} started`, index);
        break;

      case "round_completed":
        const roundNum = (msg.data?.round_number || 0) + 1;
        
        setDebates((prev) => {
          const debate = prev[index];
          
          const actualQuestionIndex = msg.data?.question_index ?? debate.currentQuestion - 1;
          const currentQ = actualQuestionIndex + 1;

          const isLastRound = roundNum >= debateData.numRounds;
          const questionsCompleted = isLastRound ? currentQ : currentQ - 1;
          
          const totalQuestionsForThisDebate = debate.questionsForThisDataset || debateData.totalQuestions;
          const progress = Math.min(
            100,
            (questionsCompleted / totalQuestionsForThisDebate) * 100
          );
          return [
            ...prev.slice(0, index),
            { ...debate, currentRound: roundNum, progress },
            ...prev.slice(index + 1),
          ];
        });
        break;
      case "round_started":
        updateDebate(index, {
          currentRound: (msg.data?.round_number || 0) + 1,
        });
        addLog(
          `Round ${(msg.data?.round_number || 0) + 1}/${
            debateData.numRounds
          } started`,
          index
        );
        break;

      case "waiting_for_human":
        const humanQuestionText =
          msg.data?.question_text || debates[index]?.currentQuestionText || "";
        const otherResponses = msg.data?.other_responses || {};
        const previousResponses = Object.entries(otherResponses).map(
          ([agentName, response]) => `${agentName}: ${response}`
        );
        
        console.log("waiting_for_human data:", msg.data);

        updateDebate(index, {
          humanInputData: {
            ...msg.data,
            question_text: humanQuestionText,
            previous_responses: previousResponses,
          },
          showHumanInput: true,
        });
        addLog("Waiting for human input...", index);
        break;

      case "debate_completed":
      case "question_completed":
        const isFullyComplete = msg.type === "debate_completed";

        const questionComplete = msg.type === "question_completed";
        const questionIndex =
          msg.data?.question_index !== undefined
            ? msg.data.question_index + 1
            : debates[index]?.currentQuestion || 0;

        const totalQuestionsForInstance = debates[index]?.questionsForThisDataset || debateData.totalQuestions;
        const isLastQuestionComplete =
          questionComplete && questionIndex >= totalQuestionsForInstance;

        if (isFullyComplete || isLastQuestionComplete) {
          const finalId = msg.debate_id || debateId || debates[index]?.id;
          if (finalId) {
            setTimeout(() => fetchDebateResults(index, finalId), 1000);
          } else {
            addLog("No debate ID available for fetching results", index);
          }
          addUniqueLog("Debate completed successfully", index, debateId);
          setDebates((prev) => [
            ...prev.slice(0, index),
            { ...prev[index], status: "completed", progress: 100 },
            ...prev.slice(index + 1),
          ]);
        } else if (questionComplete) {
          const progress = Math.min(
            100,
            (questionIndex / totalQuestionsForInstance) * 100
          );
          updateDebate(index, { progress });
          addLog(`Question ${questionIndex} completed`, index);
        }
        break;

      case "debate_cancelled":
        updateDebate(index, { status: "completed", progress: 100 });
        addLog("Debate completed successfully", index);

        const finalId = msg.debate_id || debateId || debates[index]?.id;
        if (finalId) {
          setTimeout(() => fetchDebateResults(index, finalId), 2000);
        }
        if (debates[index]?.ws) {
          debates[index].ws.close();
        }
        break;
      
      case "waiting_for_human_connection":
        updateDebate(index, { status: "running" });
        addLog("Waiting for human connection to proceed...", index);
        break;
      case "debate_error":
      case "error":
        const errorMsg = msg.message || msg.data?.error || "Unknown error";
        updateDebate(index, { status: "error", error: errorMsg });
        addLog(`Error: ${errorMsg}`, index);
        break;

      default:
        break;
    }
  };

  const waitForCompletion = (index: number): Promise<void> => {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        setDebates((prev) => {
          const debate = prev[index];
          if (debate?.status === "completed" || debate?.status === "error") {
            clearInterval(check);
            resolve();
          }
          return prev;
        });
      }, 500);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 600000);
    });
  };
  
  const fetchDebateResults = async (index: number, debateId: string) => {
    if (!debateId) {
      addLog("Cannot fetch results - no debate ID", index);
      return;
    }
    setDebates((prev) => {
      const debate = prev[index];
      if (
        debate.logs.some((log) =>
          log.includes("Results fetched successfully")
        )
      ) {
        console.log("Results already fetched, skipping...");
        return prev;
      }
      return prev;
    });

    try {
      const response = await fetch(`/api/debate/${debateId}/results`);
      const data = await response.json();
      addUniqueLog("Results fetched successfully", index, debateId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog(`Error fetching results: ${message}`, index);
    }
  };

  const handleHumanResponse = async (
    index: number,
    response: string,
    extracted: string
  ) => {
    const debate = debates[index];

    try {
      addLog(`Submitting human response: "${extracted}"`, index);
      const expId = debate.id;
      if (!expId) {
        addLog("Debate ID missing", index);
        return;
      }
      const res = await fetch(`/api/debate/${expId}/human-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_text: response,
          extracted_answer: extracted,
        }),
      });

      const data = await res.json();

      if (data.success) {
        addLog("Human response submitted successfully", index);
        updateDebate(index, {
          showHumanInput: false,
          humanInputData: null,
        });
      } else {
        throw new Error(data.message || "Failed to submit response");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog(`Error submitting human response: ${message}`, index);
    }
  };

  const downloadLogs = () => {
    const content =
      globalLogs.join("\n") +
      "\n\nINDIVIDUAL DEBATE LOGS\n\n" +
      debates
        .map(
          (d, i) =>
            `\n--- Debate ${i + 1}: ${d.dataset} (Seed: ${
              d.seed
            }) ---\n${d.logs.join("\n")}`
        )
        .join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debate_logs_${debateData.experimentName}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="status-icon status-icon-completed" />;
      case "running":
        return <Activity className="status-icon status-icon-running" />;
      case "error":
        return <AlertCircle className="status-icon status-icon-error" />;
      case "starting":
        return <Clock className="status-icon status-icon-starting" />;
      default:
        return <Clock className="status-icon status-icon-idle" />;
    }
  };

  const overallProgress =
    debates.length > 0
      ? debates.reduce((sum, d) => sum + d.progress, 0) / debates.length
      : 0;

  const completed = debates.filter((d) => d.status === "completed").length;

  return (
    <div className="debate-progress-container">
      {debates.map(
        (debate, i) =>
          debate.showHumanInput && (
            <HumanInputModal
              key={i}
              isOpen={true}
              questionData={debate.humanInputData}
              onSubmit={(text: string, extracted: string) =>
                handleHumanResponse(i, text, extracted)
              }
              onClose={() => updateDebate(i, { showHumanInput: false })}
            />
          )
      )}

      <div className="header">
        <div className="header-content">
          <div className="back-button" onClick={onBack}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Form
          </div>
          <div className="back-button" onClick={onBackDashboard}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </div>
          <div className="header-main">
            <div>
              <h1 className="header-title">{debateData.experimentName}</h1>
              <p className="header-subtitle">
                {debates.length} debate(s) •{" "}
                {debateData.selectedDatasets.length || 1} dataset(s) ×{" "}
                {debateData.seeds.length} seed(s)
              </p>
            </div>
            <div className="header-controls">
              <Button
                buttonStyle="secondary"
                variant="solid"
                color="black"
                icon={Download}
                iconPosition="start"
                iconColor="white"
                size="lg"
                onClick={downloadLogs}
                disabled={globalLogs.length === 0}
              >
                Download Logs
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="card">
          <h3 className="card-title">
            <Activity className="w-5 h-5 text-green-500" />
            Overall Progress
          </h3>
          <div className="progress-section">
            <div>
              <div className="progress-header">
                <span>
                  {completed} of {debates.length} completed
                </span>
                <span className="progress-percentage">
                  {Math.round(overallProgress)}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill progress-running"
                  style={{ width: `${overallProgress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">
            <Brain className="w-5 h-5 text-blue-500" />
            Individual Debates ({debates.length})
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {debates.map((debate, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() =>
                    updateDebate(i, { expanded: !debate.expanded })
                  }
                  style={{
                    padding: "1rem",
                    cursor: "pointer",
                    backgroundColor: debate.expanded ? "#f9fafb" : "white",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  {getStatusIcon(debate.status)}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
                      {debate.dataset} - Seed {debate.seed}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      {debate.status === "running" &&
                        `Question ${debate.currentQuestion}/${debate.questionsForThisDataset || debateData.totalQuestions}, Round ${debate.currentRound}/${debateData.numRounds}`}
                      {debate.status === "completed" &&
                        "Completed successfully"}
                      {debate.status === "error" && `Error: ${debate.error}`}
                      {debate.status === "starting" && "Starting..."}
                      {debate.status === "idle" && "Idle"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: "100px" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: "600" }}>
                      {Math.round(debate.progress)}%
                    </div>
                    <div
                      className="progress-bar"
                      style={{ marginTop: "4px", height: "8px" }}
                    >
                      <div
                        className={`progress-fill ${
                          debate.status === "completed"
                            ? "progress-completed"
                            : debate.status === "error"
                            ? "progress-error"
                            : "progress-running"
                        }`}
                        style={{ width: `${debate.progress}%` }}
                      />
                    </div>
                  </div>
                  {debate.expanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>

                {debate.expanded && (
                  <div
                    className="logs-content"
                    style={{ height: "300px", borderTop: "1px solid #e5e7eb" }}
                  >
                    <div className="logs-inner">
                      {debate.logs.length === 0 ? (
                        <div className="logs-empty">No logs yet...</div>
                      ) : (
                        debate.logs.map((log, j) => (
                          <div key={j} className="log-entry">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="logs-container">
          <div className="logs-header">
            <div className="logs-header-content">
              <div className="logs-title">
                <Terminal className="w-5 h-5" />
                Global Execution Logs
              </div>
              <div className="logs-count">{globalLogs.length} entries</div>
            </div>
          </div>
          <div className="logs-content">
            <div className="logs-inner">
              {globalLogs.length === 0 ? (
                <div className="logs-empty">No logs yet...</div>
              ) : (
                globalLogs.map((log, i) => (
                  <div key={i} className="log-entry">
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateProgressMonitor;
