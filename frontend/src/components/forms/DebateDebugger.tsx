import React, { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";
import {
  ArrowLeft,
  Play,
  User,
  Brain,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import './DebateDebugger.scss';

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
  uniqueId: string;
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
  const [debateDetails, setDebateDetails] = useState<DebateDetails | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [agentToReplace, setAgentToReplace] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

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
                `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`
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
              if (run.status === "completed") {
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
                    task: run.dataset_name,
                    seed: run.seed,
                    num_agents: experimentGroup.model_config.LLM.length,
                    llm_conf: experimentGroup.model_config.LLM,
                    wandb_metadata: run.wandb_metadata,
                  },
                  seed: run.seed,
                  dataset_name: run.dataset_name,
                  status: run.status,
                  uniqueId: uniqueId,
                });
              }
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
      selectedRound === null ||
      agentToReplace === null ||
      !debateDetails
    ) {
      setError("Please select a debate, question, round, and agent to replace");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const questionData = debateDetails.questions[selectedQuestion];
      const selectedAgentName = agents[agentToReplace]
        .replace(/_agent_\d+$/, "")
        .replace(/-chat/, "")
        .replace(/^human$/, "human-participant");
      const agent_counts: Record<string, number> = agents.reduce(
        (acc: Record<string, number>, agent: string) => {
          const cleanAgentName = agent.replace(/_agent_\d+$/, "");
          acc[cleanAgentName] = (acc[cleanAgentName] || 0) + 1;
          return acc;
        },
        {}
      );

      if ("human" in agent_counts) {
        agent_counts["human-participant"] = agent_counts["human"];
        delete agent_counts["human"];
      }
      console.log("Agent counts:", agent_counts);
      const previousRounds = questionData.debate_session.rounds
        .slice(0, selectedRound)
        .map((round) => {
          const filteredResponses = { ...round.responses };
          delete filteredResponses[selectedAgentName];
          return {
            ...round,
            responses: filteredResponses,
          };
        });
      const payload = {
        original_debate_id: selectedDebate.debate_id,
        question_index: selectedQuestion,
        start_from_round: selectedRound,
        replace_agent_name: selectedAgentName.replace(/_agent_\d+$/, ""),
        question_data: {
          question_text: questionData.question,
          question_prompt: questionData.question_prompt,
          correct_answer: questionData.correct_answer,
        },
        previous_rounds: previousRounds,
        original_config: {
          ...selectedDebate.config,
          num_rounds: numRounds,
          agent_counts: agent_counts,
        },
      };
      console.log("Replay payload:", payload);
      const response = await fetch("/api/debate/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        if (onReplayStarted) {
          const replayInfo = {
            success: true,
            debate_id: result.debate_id,
            experiment_name: selectedDebate.experiment_name || selectedDebate.name || "Replay Debate",
            dataset: selectedDebate.dataset_name,
            seed: selectedDebate.seed,
            num_questions: 1,
            num_rounds: numRounds,
            agent_counts: agent_counts,
            question_index: selectedQuestion,
            start_from_round: selectedRound,
            isReplay: true,
            existingDebateId: result.debate_id,
          };
          console.log("Passing replay info to parent:", replayInfo);
          onReplayStarted(replayInfo);
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

  return (
    <div className="debate-debugger-container">
      <div className="header">
        <div className="header-content">
          <div className="header-main">
            <div className="header-info">
              <h1 className="header-title">Debate Debugger</h1>
              <p className="header-subtitle">
                Replay completed debates with human intervention
              </p>
            </div>
             <Button
                buttonStyle="secondary"
                variant="solid"
                color="blue"
                icon={RefreshCw}
                iconPosition="start"
                iconColor="white"
                size="lg"
                onClick={fetchCompletedDebates}
                disabled={loading}
              >
                Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="main-content">
        {error && (
          <div className="error-notification">
            <div className="error-content">
              <div className="error-icon">
                <AlertCircle />
              </div>
              <div className="error-text">
                <p className="error-title">Error</p>
                <p className="error-message">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="error-close">
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="content-grid">
          <div className="debates-panel">
            <div className="debates-header">
              <h2 className="debates-title">
                Completed Debates ({debates.length})
              </h2>
              <div className="search-container">
                <Search />
                <input
                  type="text"
                  placeholder="Search debates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="debates-list">
              {loading && debates.length === 0 ? (
                <div className="debates-loading">
                  <RefreshCw className="spinning" />
                  <p>Loading debates...</p>
                </div>
              ) : filteredDebates.length === 0 ? (
                <div className="debates-empty">
                  {debates.length === 0 ? (
                    <>
                      <Brain />
                      <p>No completed debates found</p>
                      <p className="subtitle">Run some debates to get started</p>
                    </>
                  ) : (
                    <>
                      <Search />
                      <p>No debates match your search</p>
                    </>
                  )}
                </div>
              ) : (
                filteredDebates.map((debate) => (
                  <button
                    key={debate.uniqueId}
                    onClick={() => handleDebateSelect(debate)}
                    className={`debate-item ${
                      selectedDebate?.uniqueId === debate.uniqueId
                        ? "selected"
                        : ""
                    }`}
                  >
                    <div className="debate-name">{debate.name}</div>
                    <div className="debate-date">
                      {new Date(debate.created_at).toLocaleDateString()}
                    </div>
                    <div className="debate-meta">
                      {debate.debate_id ? (
                        <span className="debate-id">ID: {debate.debate_id}</span>
                      ) : (
                        <span className="debate-external">
                          External (No replay)
                        </span>
                      )}
                      <span className="debate-status">{debate.status}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="details-panel">
            {!selectedDebate ? (
              <div className="empty-state">
                <Brain />
                <h3>Select a Debate</h3>
                <p>
                  Choose a completed debate from the list to replay with human
                  intervention
                </p>
              </div>
            ) : (
              <>
                {!selectedDebate.debate_id && (
                  <div className="warning-notification">
                    <div className="warning-content">
                      <div className="warning-icon">
                        <AlertCircle />
                      </div>
                      <div className="warning-text">
                        <p className="warning-title">View Only</p>
                        <p>
                          This debate was imported from an external source and
                          cannot be replayed. Only debates created through this
                          system can be replayed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card">
                  <h3 className="card-title">
                    1. Select Question ({debateDetails?.questions?.length || 0}{" "}
                    total)
                  </h3>
                  {loading && !debateDetails ? (
                    <div className="debates-loading">
                      <RefreshCw className="spinning" />
                      <p>Loading debate questions...</p>
                    </div>
                  ) : debateDetails && debateDetails.questions ? (
                    <>
                     {selectedQuestion !== null && (
                        <div className="question-display">
                          <div className="question-label">
                            SELECTED QUESTION {selectedQuestion + 1}
                          </div>
                          <div className="question-text">
                            {debateDetails.questions[selectedQuestion].question}
                          </div>
                        </div>
                      )}
                      <div className="question-grid">
                        {debateDetails.questions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedQuestion(idx);
                              setSelectedRound(0);
                              setAgentToReplace(null);
                            }}
                            className={`question-button ${
                              selectedQuestion === idx ? "selected" : ""
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
                    </>
                  ) : (
                    <div className="debates-empty">
                      <p>No questions available</p>
                    </div>
                  )}
                </div>

                {selectedQuestion !== null && debateDetails && (
                  <div className="card">
                    <h3 className="card-title">2. Select Starting Round</h3>
                    <div className="rounds-grid">
                      {Array.from({ length: numRounds }, (_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedRound(idx)}
                          disabled={!selectedDebate.debate_id}
                          className={`round-button ${
                            selectedRound === idx ? "selected" : ""
                          }`}
                        >
                          <div className="round-number">Round {idx}</div>
                          <div className="round-description">
                            {idx === 0 ? "Start fresh" : "Resume from here"}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedRound > 0 && currentQuestion && (
                      <div className="previous-rounds">
                        <div className="previous-rounds-title">
                          Previous Round Responses:
                        </div>
                        {currentQuestion.debate_session.rounds
                          .slice(0, selectedRound)
                          .map((round, rIdx) => (
                            <div key={rIdx} className="round-preview">
                              <div className="round-preview-label">
                                Round {rIdx}
                              </div>
                              {Object.entries(round.responses).map(
                                ([agent, response]) => (
                                  <div
                                    key={agent}
                                    className="round-preview-response"
                                  >
                                    <span className="agent-name">{agent}:</span>{" "}
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
                    <div className="card">
                      <h3 className="card-title">3. Replace Agent with Human</h3>
                      <div className="agents-grid">
                        {agents.map((agent, idx) => (
                          <button
                            key={idx}
                            onClick={() => setAgentToReplace(idx)}
                            disabled={!selectedDebate.debate_id}
                            className={`agent-button ${
                              agentToReplace === idx ? "selected" : ""
                            }`}
                          >
                            <div className="agent-content">
                              {agentToReplace === idx ? (
                                <User className="human-icon" />
                              ) : (
                                <Brain className="ai-icon" />
                              )}
                              <div className="agent-info">
                                <div className="agent-name">{agent}</div>
                                <div className="agent-description">
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
                    <div className="card">
                      <div className="info-notification">
                        <div className="info-content">
                          <div className="info-icon">
                            <AlertCircle />
                          </div>
                          <div className="info-text">
                            <p className="info-title">Ready to replay</p>
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
                        className="replay-button"
                      >
                        <Play />
                        {loading
                          ? "Starting Replay..."
                          : "Start Replay with Human"}
                      </button>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateDebugger;