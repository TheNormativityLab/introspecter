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
    const instances: DebateInstance[] = [];
    console.log("🔍 Debug initializeDebates:");
    console.log("  - selectedDatasets:", debateData.selectedDatasets);
    console.log("  - customQuestions:", debateData.customQuestions);

    const hasCustomQuestions = (debateData.customQuestions || []).length > 0;

    // Run custom questions if they exist (regardless of selectedDatasets)
    const shouldRunCustomQuestions = hasCustomQuestions;

    const datasetsToRun =
      debateData.selectedDatasets?.filter((d) => d !== "custom_questions") ||
      [];

    console.log("Final datasets to run:", datasetsToRun);
    console.log("Will run custom questions:", shouldRunCustomQuestions);

    // Process regular datasets
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
        });
      });
      console.log(
        "Added custom_questions instances:",
        debateData.customQuestions.length
      );
    }

    setDebates(instances);
    addLog(
      `Initialized ${instances.length} debate(s) across ${
        datasetsToRun.length + (shouldRunCustomQuestions ? 1 : 0)
      } dataset(s)`
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    for (let i = 0; i < instances.length; i++) {
      if (!isMountedRef.current) break;
      await startDebateWithInstance(instances[i], i);
      await waitForCompletion(i);
    }
  };

  const startDebateWithInstance = async (
    debate: DebateInstance,
    index: number
  ) => {
    updateDebate(index, { status: "starting" });
    addLog(`Starting ${debate.dataset} (seed: ${debate.seed})`, index);

    try {
      const isCustomQuestions = debate.datasets?.includes("custom_questions");
      const agentModels =
        debateData.agents?.filter((a) => a.enabled)?.map((a) => a.model) || [];

      console.log("🤖 Agent extraction:", {
        rawAgents: debateData.agents,
        enabledAgents: debateData.agents?.filter((a) => a.enabled),
        agentModels: agentModels,
      });

      // Validate we have at least one agent
      if (agentModels.length === 0) {
        throw new Error(
          "At least 1 agent is required. Please enable at least one agent."
        );
      }
      console.log("🔍 Debug agent data:", {
        hasDebateData: !!debateData,
        hasAgents: !!debateData?.agents,
        agentsIsArray: Array.isArray(debateData?.agents),
        agentsLength: debateData?.agents?.length,
        rawAgents: debateData?.agents,
        firstAgent: debateData?.agents?.[0],
        enabledAgentsCount: debateData?.agents?.filter((a) => a.enabled)
          ?.length,
      });

      // Check if agents exist and are enabled
      if (!debateData?.agents || debateData.agents.length === 0) {
        throw new Error("No agents configured. Please add at least one agent.");
      }

      const enabledAgents = debateData.agents.filter((a) => a.enabled);
      if (enabledAgents.length === 0) {
        throw new Error("No agents enabled. Please enable at least one agent.");
      }
      const humanAgentIndex = agentModels.findIndex(
        (model) => model === "human-participant"
      );
      const payload: any = {
        debate_type: "basic_debate",
        task: isCustomQuestions ? "custom" : debate.dataset || "mmlu",
        num_questions: debateData.totalQuestions,
        num_rounds: debateData.numRounds,
        agent_models: agentModels,
        human_agent_index: humanAgentIndex >= 0 ? humanAgentIndex : null,
        seed: debate.seed,
        name: debateData.experimentName,
        summarize: true,
        selectedDatasets: debate.datasets || [debate.dataset],
        custom_questions: isCustomQuestions
          ? debateData.customQuestions
          : undefined,
      };

      if (
        isCustomQuestions &&
        !payload.selectedDatasets.includes("custom_questions")
      ) {
        payload.selectedDatasets = ["custom_questions"];
      }

      // Remove undefined fields
      Object.keys(payload).forEach(
        (key) => payload[key] === undefined && delete payload[key]
      );

      console.log("📤 Sending debate request:", {
        endpoint: "/api/new-debate",
        task: payload.task,
        seed: payload.seed,
        selectedDatasets: payload.selectedDatasets,
        hasCustomQuestions: !!payload.custom_questions?.length,
        numCustomQuestions: payload.custom_questions?.length || 0,
        customQuestionsPreview: payload.custom_questions?.[0],
        agentModels: payload.agent_models,
        numAgents: payload.agent_models.length,
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

      updateDebate(index, { id: result.debate_id });
      addLog(`Created debate ${result.debate_id.substring(0, 8)}`, index);

      addLog("Connecting WebSocket...", index);
      connectWebSocket(index, result.debate_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      updateDebate(index, { status: "error", error: message });
      addLog(`Error: ${message}`, index);
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
            console.log("📨 WS Message:", message.type, message);

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

        ws.onerror = (err) => {};

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

      case "question_started":
        const qNum = (msg.data?.question_index || 0) + 1;
        const questionText =
          msg.data?.question_text || msg.data?.question || "";
        updateDebate(index, {
          currentQuestion: qNum,
          currentQuestionText: questionText,
        });
        addLog(`Question ${qNum}/${debateData.totalQuestions} started`, index);
        break;

      case "round_completed":
        const roundNum = (msg.data?.round_number || 0) + 1;
        addLog(`Round ${roundNum} completed`, index);

        setDebates((prev) => {
          const debate = prev[index];
          const currentQ =
            msg.data?.question_index !== undefined
              ? msg.data.question_index + 1
              : debate.currentQuestion;

          const isLastRound = roundNum >= debateData.numRounds;
          const isLastQuestion = currentQ >= debateData.totalQuestions;
          const questionsCompleted = isLastRound ? currentQ : currentQ - 1;
          const progress = Math.min(
            100,
            (questionsCompleted / debateData.totalQuestions) * 100
          );
          return [
            ...prev.slice(0, index),
            { ...debate, progress },
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

        const isLastQuestionComplete =
          questionComplete && questionIndex >= debateData.totalQuestions;

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
            (questionIndex / debateData.totalQuestions) * 100
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

      alert(`Failed to submit response: ${message}\nPlease try again.`);
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
                        `Question ${debate.currentQuestion}/${debateData.totalQuestions}, Round ${debate.currentRound}/${debateData.numRounds}`}
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
