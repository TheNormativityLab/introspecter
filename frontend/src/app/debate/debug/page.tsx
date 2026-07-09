"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  LayoutGrid,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Bug,
  RefreshCw,
  Filter,
  User,
  Brain,
  Target
} from "lucide-react";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

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
      responses: { [agent: string]: any };
    }[];
  };
}

interface DebateDetails {
  questions: Question[];
}

const isHumanAgentName = (name?: string) => {
  if (!name) return false;

  const n = String(name).toLowerCase();

  return (
    n.includes("human") ||
    n.includes("human-participant") ||
    n.includes("human_participant") ||
    n.includes("mock/human")
  );
};

const normalizeAgentName = (name?: string) => {
  if (!name) return "";

  let n = String(name).toLowerCase().trim();

  if (n.includes("_agent_")) {
    n = n.split("_agent_")[0];
  }

  n = n
    .replace(/^vec-/, "")
    .replace(/^together-/, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .replace(/^anthropic\//, "")
    .replace(/\//g, "-")
    .replace(/_/g, "-")
    .replace(/\./g, "-");

  const suffixes = ["-chat", "-instruct", "-turbo", "-it"];

  for (const suffix of suffixes) {
    if (n.endsWith(suffix)) {
      n = n.slice(0, -suffix.length);
    }
  }

  return n.replace(/-+/g, "-").replace(/^-|-$/g, "");
};

const modelMatchesAgent = (
  modelValue: string | undefined,
  agentName: string
) => {
  const modelNorm = normalizeAgentName(modelValue);
  const agentNorm = normalizeAgentName(agentName);

  if (!modelNorm || !agentNorm) return false;

  return (
    modelNorm === agentNorm ||
    modelNorm.includes(agentNorm) ||
    agentNorm.includes(modelNorm)
  );
};

const getBackendReplaceIndex = (
  selectedAgentName: string,
  replaceableAgentsList: string[],
  llmConf: LLMConfig[],
  fallbackIndex: number
) => {
  const nonHumanLLMs = (llmConf || []).filter((m) => {
    return !isHumanAgentName(m.model) && !isHumanAgentName(m.modelName);
  });

  const directIndex = nonHumanLLMs.findIndex((m) => {
    return (
      modelMatchesAgent(m.modelName, selectedAgentName) ||
      modelMatchesAgent(m.model, selectedAgentName)
    );
  });

  if (directIndex >= 0) return directIndex;

  const selectedBase = normalizeAgentName(selectedAgentName);

  const replaceableBaseIndex = replaceableAgentsList.findIndex(
    (agent) => normalizeAgentName(agent) === selectedBase
  );

  if (replaceableBaseIndex >= 0) return replaceableBaseIndex;

  return fallbackIndex;
};

const parseMaybeJson = (value: any) => {
  if (!value) return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
};

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { icon: <LayoutGrid size={20} />, label: "Dashboard", path: "/" },
    { icon: <Target size={20} />, label: "Analysis Agent", path: "/harness" },
    {
      icon: <FileText size={20} />,
      label: "Debate Annotation",
      path: "/debate-annotation"
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Basic Debate",
      path: "/debate/new"
    },
    { icon: <Bug size={20} />, label: "Debug", path: "/debate/debug" }
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

export default function DebateDebuggerPage() {
  const router = useRouter();

  const [debates, setDebates] = useState<Debate[]>([]);
  const [debateDetails, setDebateDetails] = useState<DebateDetails | null>(
    null
  );
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
    setError(null);

    try {
      const response = await fetch("/api/all-debates");

      if (!response.ok) {
        throw new Error("Failed to fetch debates.");
      }

      const data = await response.json();
      const allDebates: Debate[] = [];

      if (data.experiment_groups) {
        data.experiment_groups.forEach((group: ExperimentGroup) => {
          group.runs.forEach((run: DebateRun) => {
            const experimentName = group.experiment_name || "";

            const isReplay =
              run.is_replay ||
              experimentName.toLowerCase().startsWith("replay_") ||
              experimentName.toLowerCase().includes("replay");

            const hasHuman = group.model_config?.LLM?.some((m) => {
              return (
                isHumanAgentName(m.model) ||
                isHumanAgentName(m.modelName) ||
                isHumanAgentName(String(m.id))
              );
            });

            console.log("Debugger debate list item:", {
              experimentName,
              debate_id: run.debate_id,
              status: run.status,
              isReplay,
              hasHuman,
              model_config: group.model_config,
              wandb_metadata: run.wandb_metadata
            });

            /**
             * Important:
             * Do NOT exclude hasHuman here.
             *
             * We want completed debates with original human participants
             * to appear in the list.
             *
             * Existing human participants are hidden later from the
             * replacement selector by replaceableAgents.
             */
            if (run.status === "completed" && !isReplay) {
              allDebates.push({
                debate_id: run.debate_id,
                experiment_name: group.experiment_name,
                name: `${group.experiment_name}`,
                created_at: run.processed_at,
                config: {
                  ...group.model_config,
                  seed: run.seed,
                  wandb_metadata: parseMaybeJson(run.wandb_metadata),
                  has_human: hasHuman
                },
                seed: run.seed,
                dataset_name: run.dataset_name ?? "Unknown",
                status: run.status,
                uniqueId: run.debate_id
                  ? `db-${run.debate_id}`
                  : `exp-${group.experiment_name}-${run.seed}`
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
    setError(null);
    setDetailsLoading(true);

    try {
      if (debate.debate_id) {
        const res = await fetch(`/api/debate-run?debateId=${debate.debate_id}`);
        const data = await res.json();

        if (data.success && data.run_details?.result_data) {
          let result = data.run_details.result_data;

          if (typeof result === "string") {
            result = JSON.parse(result);
          }

          const details = Array.isArray(result)
            ? { questions: result }
            : result;

          setDebateDetails(details);

          if (details?.questions?.length > 0) {
            setSelectedQuestion(0);
          }

          setDetailsLoading(false);
          return;
        }
      }

      const res = await fetch(
        `/api/single-debate?experimentName=${encodeURIComponent(
          debate.experiment_name || ""
        )}&seed=${debate.seed}`
      );

      const data = await res.json();

      if (data.runs?.[0]?.result_data) {
        let result = data.runs[0].result_data;

        if (typeof result === "string") {
          result = JSON.parse(result);
        }

        const details = Array.isArray(result) ? { questions: result } : result;

        setDebateDetails(details);

        if (details?.questions?.length > 0) {
          setSelectedQuestion(0);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load debate details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const currentQuestionData =
    selectedQuestion !== null && debateDetails
      ? debateDetails.questions[selectedQuestion]
      : null;

  const numRounds = currentQuestionData?.debate_session?.rounds?.length || 0;

  const currentAgents =
    currentQuestionData?.debate_session?.rounds?.[0]?.responses
      ? Object.keys(currentQuestionData.debate_session.rounds[0].responses)
      : [];

  const replaceableAgents = currentAgents.filter(
    (agent) => !isHumanAgentName(agent)
  );

  /**
   * Default to first replaceable AI agent.
   *
   * This does NOT overwrite user's choice unless:
   * - no agent is currently selected, or
   * - selected index is now out of range.
   */
  useEffect(() => {
    if (replaceableAgents.length === 0) {
      if (agentToReplace !== null) {
        setAgentToReplace(null);
      }

      return;
    }

    if (agentToReplace === null || agentToReplace >= replaceableAgents.length) {
      setAgentToReplace(0);
    }
  }, [replaceableAgents.length, agentToReplace]);

  const handleStartReplay = async () => {
    if (
      !selectedDebate ||
      selectedQuestion === null ||
      agentToReplace === null ||
      !debateDetails
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const questionData = debateDetails.questions[selectedQuestion];

      if (!questionData?.debate_session?.rounds?.[0]?.responses) {
        throw new Error("Selected question has no round responses.");
      }

      const allAgentsList = Object.keys(
        questionData.debate_session.rounds[0].responses
      );

      const replaceableAgentsList = allAgentsList.filter(
        (agent) => !isHumanAgentName(agent)
      );

      const selectedAgentName = replaceableAgentsList[agentToReplace];

      if (!selectedAgentName) {
        throw new Error("Invalid agent selected for replacement.");
      }

      const llmConf: LLMConfig[] = selectedDebate.config?.LLM || [];

      const backendReplaceIndex = getBackendReplaceIndex(
        selectedAgentName,
        replaceableAgentsList,
        llmConf,
        agentToReplace
      );

      const agent_counts: Record<string, number> = {};

      replaceableAgentsList.forEach((agent) => {
        const normalized = normalizeAgentName(agent);
        if (!normalized) return;
        agent_counts[normalized] = (agent_counts[normalized] || 0) + 1;
      });

      const previousRounds = questionData.debate_session.rounds
        .slice(0, selectedRound)
        .map((round) => ({
          responses: round.responses
        }));

      const payload = {
        original_debate_id: selectedDebate.debate_id,
        question_index: selectedQuestion,
        start_from_round: selectedRound,
        num_rounds: questionData.debate_session.rounds.length,
        replace_agent_index: backendReplaceIndex,
        replace_agent_name: selectedAgentName,

        question_data: {
          question: questionData.question,
          question_prompt: questionData.question_prompt,
          answer: questionData.correct_answer
        },

        previous_rounds: previousRounds,

        original_config: {
          ...selectedDebate.config,
          experiment_name: selectedDebate.experiment_name || selectedDebate.name,
          seed: selectedDebate.seed,
          dataset_name: selectedDebate.dataset_name,
          num_rounds: questionData.debate_session.rounds.length,
          agent_counts,
          llm_conf: llmConf.length > 0 ? llmConf : undefined,
          wandb_metadata: selectedDebate.config?.wandb_metadata
        }
      };

      console.log("Replay allAgentsList:", allAgentsList);
      console.log("Replay replaceableAgentsList:", replaceableAgentsList);
      console.log("Replay selectedAgentName:", selectedAgentName);
      console.log("Replay backendReplaceIndex:", backendReplaceIndex);
      console.log("Replay payload:", payload);

      const res = await fetch("/api/debate/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result?.detail ||
            result?.message ||
            result?.error ||
            "Failed to start replay."
        );
      }

      if (result.success && result.debate_id) {
        const replayAgents = replaceableAgentsList.map((agentName, idx) => ({
          id: agentName,
          name: agentName,
          model: idx === agentToReplace ? "human-participant" : agentName,
          enabled: true,
          isHuman: idx === agentToReplace
        }));

        setMonitorConfig({
          experimentName:
            result.experiment_name ||
            selectedDebate.experiment_name ||
            selectedDebate.name,
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
        setError(result.message || "Failed to start replay.");
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to start replay.");
    } finally {
      setLoading(false);
    }
  };

  const filteredDebates = debates.filter((debate) => {
    const q = searchTerm.toLowerCase();

    return (
      (debate.name || "").toLowerCase().includes(q) ||
      (debate.dataset_name || "").toLowerCase().includes(q)
    );
  });

  if (showMonitor && monitorConfig) {
    return (
      <DebateProgressMonitor
        debateData={monitorConfig}
        onBack={() => {
          setShowMonitor(false);
          setMonitorConfig(null);
        }}
        onBackDashboard={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      <Sidebar />

      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col z-20 flex-shrink-0">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <Filter size={12} /> Completed Debates
            </div>

            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {debates.length}
            </span>
          </div>

          <div className="relative group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />

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
            <div className="p-8 text-center text-slate-400 text-sm">
              No debates found.
            </div>
          ) : (
            filteredDebates.map((debate) => (
              <div
                key={debate.uniqueId}
                onClick={() => handleSelectDebate(debate)}
                className={`px-5 py-4 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 group relative ${
                  selectedDebate?.uniqueId === debate.uniqueId
                    ? "bg-blue-50/60"
                    : ""
                }`}
              >
                {selectedDebate?.uniqueId === debate.uniqueId && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                )}

                <div className="flex justify-between items-start mb-1.5">
                  <span
                    className={`font-semibold text-sm truncate pr-2 ${
                      selectedDebate?.uniqueId === debate.uniqueId
                        ? "text-blue-900"
                        : "text-slate-700"
                    }`}
                  >
                    {debate.name}
                  </span>

                  <CheckCircle2
                    size={16}
                    className="text-emerald-500 flex-shrink-0"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2.5">
                  <Clock size={10} />{" "}
                  {debate.created_at
                    ? new Date(debate.created_at).toLocaleDateString()
                    : "Unknown date"}
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600 uppercase">
                    {debate.dataset_name}
                  </span>

                  <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600">
                    Seed {debate.seed}
                  </span>

                  {debate.config?.has_human && (
                    <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] font-medium text-amber-700">
                      Has Human
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc]">
        <header className="px-8 py-5 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Debate Debugger
            </h1>

            <p className="text-sm text-slate-500 mt-0.5">
              Replay completed debates with human intervention.
            </p>
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

              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Select a Debate
              </h3>

              <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                Choose a completed debate from the sidebar to configure a human
                intervention replay.
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Selected Run
                  </div>

                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedDebate.name}
                  </h2>

                  <p className="text-sm text-slate-500 font-mono mt-1">
                    ID: {selectedDebate.debate_id || "External"}
                  </p>
                </div>

                {detailsLoading && (
                  <RefreshCw className="animate-spin text-blue-500" />
                )}
              </div>

              {debateDetails && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700">
                      1. Select Question
                    </h3>

                    <span className="text-xs font-mono text-slate-400">
                      {debateDetails.questions.length} Questions
                    </span>
                  </div>

                  <div className="p-6">
                    {selectedQuestion !== null && (
                      <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900 leading-relaxed">
                        <span className="font-bold block mb-1 text-blue-700">
                          Preview:
                        </span>
                        {debateDetails.questions[selectedQuestion].question}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {debateDetails.questions.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedQuestion(idx);
                            setSelectedRound(0);
                            setAgentToReplace(null);
                          }}
                          className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${
                            selectedQuestion === idx
                              ? "bg-blue-600 text-white border-blue-600 shadow-md"
                              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
                    <h3 className="font-semibold text-slate-700">
                      2. Select Starting Round
                    </h3>
                  </div>

                  <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: numRounds }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedRound(i);
                          setAgentToReplace(null);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedRound === i
                            ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className={`text-xs font-bold uppercase mb-1 ${
                            selectedRound === i
                              ? "text-blue-600"
                              : "text-slate-400"
                          }`}
                        >
                          Round {i}
                        </div>

                        <div
                          className={`text-sm ${
                            selectedRound === i
                              ? "text-blue-900 font-medium"
                              : "text-slate-600"
                          }`}
                        >
                          {i === 0 ? "Start Fresh" : "Resume"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedQuestion !== null &&
                replaceableAgents.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-semibold text-slate-700">
                        3. Select Agent to Replace
                      </h3>

                      {currentAgents.length !== replaceableAgents.length && (
                        <p className="text-xs text-slate-500 mt-1">
                          Existing human participants are hidden because this
                          replay replaces an AI model with you.
                        </p>
                      )}
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      {replaceableAgents.map((agent, i) => (
                        <button
                          key={agent}
                          onClick={() => setAgentToReplace(i)}
                          className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${
                            agentToReplace === i
                              ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              agentToReplace === i
                                ? "bg-indigo-100 text-indigo-600"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {agentToReplace === i ? (
                              <User size={20} />
                            ) : (
                              <Brain size={20} />
                            )}
                          </div>

                          <div className="text-left">
                            <div
                              className={`font-bold text-sm ${
                                agentToReplace === i
                                  ? "text-indigo-900"
                                  : "text-slate-700"
                              }`}
                            >
                              {agent}
                            </div>

                            <div className="text-xs text-slate-500">
                              {agentToReplace === i
                                ? "Human (You)"
                                : "AI Model"}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {selectedQuestion !== null &&
                currentQuestionData &&
                replaceableAgents.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
                    No replaceable AI agents found for this question. Existing
                    human participants cannot be selected as the replacement
                    target.
                  </div>
                )}

              {agentToReplace !== null && (
                <div className="pt-4 pb-8">
                  <button
                    onClick={handleStartReplay}
                    disabled={loading}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <Play className="fill-current" />
                    )}
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