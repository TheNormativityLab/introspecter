import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Play,
  User,
  Brain,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";

interface DebateConfig {
  [key: string]: any;
}

interface LLMConfig {
  id: number;
  modelName: string;
  model: string;
  apiBase: string;
  timeout: number;
  numRetries: number;
  rpm: number;
  topP: number;
  maxTokens: number;
  temperature: number;
}

interface DebateRun {
  debate_id?: number;
  seed: number;
  dataset_name: string;
  status: string;
  wandb_metadata: any;
  processed_at: string;
}

interface ExperimentGroup {
  experiment_name: string;
  dataset_name: string;
  model_config: {
    LLM: LLMConfig[];
  };
  runs: DebateRun[];
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  seeds_present: number[];
  missing_seeds: number[];
  expected_seeds: number[];
  created_at: string;
  last_updated: string;
  is_complete: boolean;
  success_rate: string;
}

interface Debate {
  debate_id?: number;
  experiment_name?: string;
  name: string;
  created_at: string;
  config: DebateConfig;
  seed: number;
  dataset_name: string;
  status: string;
  uniqueId: string; // Add a unique identifier
}

interface RoundResponse {
  [agent: string]: string;
}

interface Round {
  responses: RoundResponse;
}

interface DebateSession {
  rounds: Round[];
}

interface Question {
  question: string;
  question_prompt: string;
  correct_answer: string;
  debate_session: DebateSession;
}

interface DebateDetails {
  questions: Question[];
}

interface DebateDebuggerProps {
  onReplayStarted?: (debateData: any) => void;
}

const DebateDebugger: React.FC<DebateDebuggerProps> = ({ onReplayStarted }) => {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [selectedDebate, setSelectedDebate] = useState<Debate | null>(null);
  const [debateDetails, setDebateDetails] = useState<DebateDetails | null>(
    null
  );
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [agentToReplace, setAgentToReplace] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    fetchCompletedDebates();
  }, []);

  const fetchCompletedDebates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/all-debates");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        if (data.errors) {
          const errorMessages = Object.entries(data.errors)
            .map(
              ([field, messages]) =>
                `${field}: ${
                  Array.isArray(messages) ? messages.join(", ") : messages
                }`
            )
            .join("; ");
          throw new Error(errorMessages || "Validation error");
        }
        throw new Error(data.message || "Failed to fetch debates");
      }

      const allDebates: Debate[] = [];

      if (data.experiment_groups && Array.isArray(data.experiment_groups)) {
        data.experiment_groups.forEach((experimentGroup: ExperimentGroup) => {
          if (experimentGroup.runs && Array.isArray(experimentGroup.runs)) {
            experimentGroup.runs.forEach((run: DebateRun) => {
              // Create a unique ID for debates without debate_id
              const uniqueId = run.debate_id
                ? `debate-${run.debate_id}`
                : `exp-${experimentGroup.experiment_name}-seed-${run.seed}`;

              allDebates.push({
                debate_id: run.debate_id,
                experiment_name: experimentGroup.experiment_name,
                name: `${experimentGroup.experiment_name} (Seed ${run.seed})`,
                created_at: run.processed_at,
                config: {
                  experiment_name: experimentGroup.experiment_name,
                  model_config: experimentGroup.model_config,
                  dataset_name: run.dataset_name,
                  seed: run.seed,
                },
                seed: run.seed,
                dataset_name: run.dataset_name,
                status: run.status,
                uniqueId: uniqueId,
              });
            });
          }
        });
      }

      setDebates(allDebates);

      if (allDebates.length === 0) {
        setError("No completed debates found. Run some debates first.");
      }
    } catch (err) {
      console.error("Error fetching debates:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch debates";
      setError("Failed to fetch debates: " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchDebateDetails = async (debate: Debate) => {
    setLoading(true);
    setError(null);
    try {
      let debateData = null;

      // Try debate_id approach first if available
      if (debate.debate_id) {
        try {
          const runResponse = await fetch(
            `/api/debate-run?debateId=${debate.debate_id}`
          );

          if (runResponse.ok) {
            const runData = await runResponse.json();

            if (runData.success && runData.run_details?.result_data) {
              let resultData = runData.run_details.result_data;

              if (typeof resultData === "string") {
                try {
                  resultData = JSON.parse(resultData);
                } catch (parseErr) {
                  console.error("Failed to parse result_data:", parseErr);
                }
              }

              if (Array.isArray(resultData)) {
                debateData = { questions: resultData };
              } else {
                debateData = resultData;
              }
            }
          }
        } catch (err) {
          console.log("debate-run endpoint failed, trying alternative:", err);
        }
      }

      // Fall back to experiment name + seed approach
      if (!debateData && debate.experiment_name) {
        try {
          const experimentName = debate.experiment_name;
          const seed = debate.seed;

          const singleDebateResponse = await fetch(
            `/api/single-debate?experimentName=${encodeURIComponent(
              experimentName
            )}&seed=${seed}`
          );

          if (singleDebateResponse.ok) {
            const singleDebateData = await singleDebateResponse.json();

            if (
              singleDebateData.success &&
              singleDebateData.runs &&
              singleDebateData.runs.length > 0
            ) {
              const latestRun = singleDebateData.runs[0];
              if (latestRun.result_data) {
                let resultData = latestRun.result_data;

                if (typeof resultData === "string") {
                  try {
                    resultData = JSON.parse(resultData);
                  } catch (parseErr) {
                    console.error("Failed to parse result_data:", parseErr);
                  }
                }

                if (Array.isArray(resultData)) {
                  debateData = { questions: resultData };
                } else {
                  debateData = resultData;
                }
              }
            }
          }
        } catch (err) {
          console.log("single-debate endpoint failed:", err);
        }
      }

      if (!debateData) {
        throw new Error(
          "Could not retrieve debate data. The debate may not have completed yet or the data is unavailable."
        );
      }

      let questions = null;
      if (Array.isArray(debateData)) {
        questions = debateData;
      } else if (debateData.questions && Array.isArray(debateData.questions)) {
        questions = debateData.questions;
      }

      if (!questions || questions.length === 0) {
        throw new Error("No questions found in debate results.");
      }

      setDebateDetails({
        questions: questions,
      });

      if (questions.length > 0) {
        setSelectedQuestion(0);
      }
    } catch (err) {
      console.error("Error fetching debate details:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch debate details";
      setError("Failed to fetch debate details: " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDebateSelect = async (debate: Debate) => {
    setSelectedDebate(debate);
    setSelectedQuestion(null);
    setSelectedRound(0);
    setAgentToReplace(null);
    setDebateDetails(null);
    await fetchDebateDetails(debate);
  };

  const handleReplay = async () => {
    if (
      !selectedDebate ||
      selectedQuestion === null ||
      agentToReplace === null ||
      !debateDetails
    ) {
      setError("Please select a debate, question, round, and agent to replace");
      return;
    }

    // Check if debate has a debate_id (required for replay)
    if (!selectedDebate.debate_id) {
      setError(
        "This debate cannot be replayed because it doesn't have a debate_id. " +
          "Only debates created through the system with stored IDs can be replayed."
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const questionData = debateDetails.questions[selectedQuestion];
      const payload = {
        original_debate_id: selectedDebate.debate_id,
        question_index: selectedQuestion,
        start_from_round: selectedRound,
        replace_agent_index: agentToReplace,
        question_data: {
          question_text: questionData.question,
          question_prompt: questionData.question_prompt,
          correct_answer: questionData.correct_answer,
        },
        previous_rounds: questionData.debate_session.rounds.slice(
          0,
          selectedRound
        ),
        original_config: selectedDebate.config,
      };

      const response = await fetch("/api/debate/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        alert(`Replay started! Debate ID: ${result.debate_id}`);
        if (onReplayStarted) {
          onReplayStarted(result);
        }
      } else {
        setError(result.message || "Failed to start replay");
      }
    } catch (err) {
      console.error("Error starting replay:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start replay";
      setError("Failed to start replay: " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredDebates = debates.filter(
    (d) =>
      d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.uniqueId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.dataset_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentQuestion = debateDetails?.questions?.[selectedQuestion ?? 0];
  const numRounds = currentQuestion?.debate_session?.rounds?.length || 0;
  const agents = currentQuestion?.debate_session?.rounds?.[0]?.responses
    ? Object.keys(currentQuestion.debate_session.rounds[0].responses)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Debate Debugger
              </h1>
              <p className="text-gray-600">
                Replay completed debates with human intervention
              </p>
            </div>
            <button
              onClick={fetchCompletedDebates}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Completed Debates ({debates.length})
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search debates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {loading && debates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading debates...
                  </div>
                ) : filteredDebates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    {debates.length === 0 ? (
                      <>
                        <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium">
                          No completed debates found
                        </p>
                        <p className="text-sm mt-1">
                          Run some debates to get started
                        </p>
                      </>
                    ) : (
                      <>
                        <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p>No debates match your search</p>
                      </>
                    )}
                  </div>
                ) : (
                  filteredDebates.map((debate) => (
                    <button
                      key={debate.uniqueId}
                      onClick={() => handleDebateSelect(debate)}
                      className={`w-full text-left p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                        selectedDebate?.uniqueId === debate.uniqueId
                          ? "bg-blue-50 border-l-4 border-l-blue-600"
                          : ""
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        {debate.name}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(debate.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {debate.debate_id ? (
                          <span className="text-xs text-gray-400 font-mono">
                            ID: {debate.debate_id}
                          </span>
                        ) : (
                          <span className="text-xs text-orange-600 font-mono">
                            External (No replay)
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                          {debate.status}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {!selectedDebate ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  Select a Debate
                </h3>
                <p className="text-gray-500">
                  Choose a completed debate from the list to replay with human
                  intervention
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {!selectedDebate.debate_id && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-orange-800">
                        <p className="font-medium mb-1">View Only</p>
                        <p>
                          This debate was imported from an external source and
                          cannot be replayed. Only debates created through this
                          system can be replayed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    1. Select Question ({debateDetails?.questions?.length || 0}{" "}
                    total)
                  </h3>
                  {loading && !debateDetails ? (
                    <div className="text-gray-500 flex items-center justify-center py-8">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      Loading debate questions...
                    </div>
                  ) : debateDetails && debateDetails.questions ? (
                    <>
                      <div className="grid grid-cols-8 gap-2 mb-4">
                        {debateDetails.questions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedQuestion(idx);
                              setSelectedRound(0);
                              setAgentToReplace(null);
                            }}
                            className={`aspect-square flex items-center justify-center text-sm font-medium border rounded-lg transition-colors ${
                              selectedQuestion === idx
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-700"
                            }`}
                            title={`Question ${idx + 1}: ${q.question.substring(
                              0,
                              50
                            )}...`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                      {selectedQuestion !== null && (
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="text-xs font-semibold text-gray-500 mb-1">
                            SELECTED QUESTION {selectedQuestion + 1}
                          </div>
                          <div className="text-sm text-gray-700">
                            {debateDetails.questions[selectedQuestion].question}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-gray-500 text-center py-4">
                      No questions available
                    </div>
                  )}
                </div>

                {selectedQuestion !== null && debateDetails && (
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      2. Select Starting Round
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Array.from({ length: numRounds }, (_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedRound(idx)}
                          disabled={!selectedDebate.debate_id}
                          className={`p-4 border rounded-lg text-center transition-colors ${
                            selectedRound === idx
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-200 hover:border-blue-300"
                          } ${
                            !selectedDebate.debate_id
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          <div className="font-semibold">Round {idx}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {idx === 0 ? "Start fresh" : `Resume from here`}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedRound > 0 && currentQuestion && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Previous Round Responses:
                        </div>
                        {currentQuestion.debate_session.rounds
                          .slice(0, selectedRound)
                          .map((round, rIdx) => (
                            <div key={rIdx} className="mb-3 last:mb-0">
                              <div className="text-xs font-semibold text-gray-600 mb-1">
                                Round {rIdx}
                              </div>
                              {Object.entries(round.responses).map(
                                ([agent, response]) => (
                                  <div
                                    key={agent}
                                    className="text-xs text-gray-600 ml-2"
                                  >
                                    <span className="font-medium">
                                      {agent}:
                                    </span>{" "}
                                    {response.substring(0, 80)}...
                                  </div>
                                )
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedQuestion !== null &&
                  debateDetails &&
                  agents.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        3. Replace Agent with Human
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {agents.map((agent, idx) => (
                          <button
                            key={idx}
                            onClick={() => setAgentToReplace(idx)}
                            disabled={!selectedDebate.debate_id}
                            className={`p-4 border rounded-lg transition-colors ${
                              agentToReplace === idx
                                ? "border-green-600 bg-green-50"
                                : "border-gray-200 hover:border-green-300"
                            } ${
                              !selectedDebate.debate_id
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {agentToReplace === idx ? (
                                <User className="w-5 h-5 text-green-600" />
                              ) : (
                                <Brain className="w-5 h-5 text-gray-400" />
                              )}
                              <div className="text-left">
                                <div className="font-medium text-gray-900">
                                  {agent}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {agentToReplace === idx
                                    ? "Will be replaced by human"
                                    : "Click to replace"}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {selectedQuestion !== null &&
                  agentToReplace !== null &&
                  selectedDebate.debate_id && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">Ready to replay</p>
                            <p>
                              You will replay question {selectedQuestion + 1}{" "}
                              starting from round {selectedRound}, with{" "}
                              {agents[agentToReplace]} replaced by human input.
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={handleReplay}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="w-5 h-5" />
                        {loading
                          ? "Starting Replay..."
                          : "Start Replay with Human"}
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateDebugger;
