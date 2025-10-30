"use client";
import React from "react";
import { Button } from "@/components/button/Button";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "react-feather";
import {
  MultiRunDebateData,
  DebateRun,
  EvaluationResult,
  IncorrectSwitchQuestion,
} from "../../../types/debate";
import {
  ArrowLeft,
  CheckCircle,
  MessageSquare,
  Database,
  Scale,
  TrendingDown,
  Trophy,
  PlayCircle,
  Brain,
  XCircle,
  BarChart3,
  AlertCircle,
} from "lucide-react";

import {
  solveMathProblems,
  parseMmluAnswer,
  parseCommonsenseQaAnswer,
  parseMathAnswer,
  parseGsm8kAnswer,
  parseCustomQuestionsAnswer,
  type TaskName,
} from "../../../utils/evaluation";
import "./ViewDebatePage.scss";

// ============================================
// HELPER FUNCTIONS
// ============================================

const inferDatasetFromTask = (
  task: string,
  fallbackDatasetName?: string
): string => {
  if (fallbackDatasetName) {
    const normalized = fallbackDatasetName.toLowerCase().trim();
    if (
      ["mmlu", "gsm8k", "commonsense_qa", "math", "custom_questions"].includes(
        normalized
      )
    ) {
      return normalized;
    }
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
    if (resultData.data && Array.isArray(resultData.data.questions))
      return resultData.data.questions;
    if (resultData.question_text || resultData.question) return [resultData];
  }
  return [];
};

const evaluateResponse = (
  response: string,
  correctAnswer: string | number,
  taskName: TaskName
): EvaluationResult => {
  let extractedAnswer: string | number | null = null;

  if (taskName === "mmlu") {
    extractedAnswer = parseMmluAnswer(response) ?? solveMathProblems(response);
  } else if (taskName === "math") {
    extractedAnswer = parseMathAnswer(response);
  } else if (taskName === "commonsense_qa") {
    extractedAnswer = parseCommonsenseQaAnswer(response);
  } else if (taskName === "custom_questions") {
    extractedAnswer = parseCustomQuestionsAnswer(response);
  } else if (taskName === "gsm8k") {
    extractedAnswer = parseGsm8kAnswer(response);
  }

  let isCorrect = false;
  if (extractedAnswer !== null) {
    if (taskName === "gsm8k") {
      const gtValue = solveMathProblems(correctAnswer.toString());
      const predValue = solveMathProblems(extractedAnswer.toString());
      isCorrect = predValue === gtValue;
    } else if (
      taskName === "commonsense_qa" ||
      taskName === "mmlu" ||
      taskName == "custom_questions"
    ) {
      isCorrect =
        extractedAnswer.toString().toUpperCase() ===
        correctAnswer.toString().toUpperCase();
    } else if (taskName === "math") {
      const gtValue =
        typeof correctAnswer === "string"
          ? parseFloat(correctAnswer)
          : correctAnswer;
      const predValue =
        typeof extractedAnswer === "string"
          ? parseFloat(extractedAnswer)
          : extractedAnswer;
      isCorrect = Math.abs(predValue - gtValue) < 1e-6;
    } else {
      isCorrect =
        extractedAnswer.toString().toUpperCase() ===
        correctAnswer.toString().toUpperCase();
    }
  }

  return { isCorrect, extractedAnswer };
};

// ============================================
// SUBCOMPONENTS
// ============================================

const LoadingState = () => (
  <div className="loading-container">
    <div className="loading-content">
      <div className="spinner"></div>
      <p>Loading debate...</p>
    </div>
  </div>
);

const ErrorState = ({ error }: { error: string }) => (
  <div className="error-container">
    <div className="error-content">
      <p>{error}</p>
      <button onClick={() => window.location.reload()}>Retry</button>
    </div>
  </div>
);

const getDatasetName = (
  debateData: MultiRunDebateData | null,
  runIndex: number | undefined
) => {
  if (!debateData || runIndex === undefined) return "Dataset";
  const run = debateData.runs?.[runIndex];
  return run?.dataset_name || `Dataset ${runIndex + 1}`;
};

const getDatasetDisplayName = (dataset: string): string => {
  const names: { [key: string]: string } = {
    mmlu: "MMLU",
    gsm8k: "GSM8K",
    commonsense_qa: "CommonsenseQA",
    math: "MATH",
    custom_questions: "Custom Questions",
  };
  return names[dataset.toLowerCase()] || dataset.toUpperCase();
};

const EvaluationBadge = ({
  evaluation,
}: {
  evaluation: EvaluationResult | undefined;
}) => {
  if (!evaluation) return null;

  const isCorrect = evaluation.isCorrect;
  return (
    <div className="evaluation-badge">
      <span className={`status-badge ${isCorrect ? "correct" : "incorrect"}`}>
        {isCorrect ? (
          <CheckCircle className="w-3 h-3" />
        ) : (
          <XCircle className="w-3 h-3" />
        )}
        {isCorrect ? "Correct" : "Incorrect"}
      </span>
      {evaluation.extractedAnswer !== null && (
        <span className={`answer-badge ${isCorrect ? "correct" : "incorrect"}`}>
          Answer: {evaluation.extractedAnswer}
        </span>
      )}
    </div>
  );
};

const QuestionNavigator = ({
  currentIndex,
  total,
  onPrevious,
  onNext,
  showRunFilter,
  selectedRun,
  totalRuns,
  onRunChange,
  debateData,
}: {
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  showRunFilter?: boolean;
  selectedRun?: number;
  totalRuns?: number;
  onRunChange?: (run: number) => void;
  debateData?: MultiRunDebateData | null;
}) => (
  <div className="navigator-card">
    <div className="navigator-header">
      <h3>Navigate Questions</h3>
      <span className="question-counter">
        {total === 0
          ? "No questions"
          : `${currentIndex + 1} of ${total} questions`}
      </span>
    </div>

    <div className="navigator-controls">
      {showRunFilter && totalRuns && totalRuns > 1 && (
        <div className="dataset-selector">
          <Database />
          <label>Select Dataset:</label>
          <select
            value={selectedRun}
            onChange={(e) => onRunChange?.(parseInt(e.target.value))}
          >
            {Array.from({ length: totalRuns! }, (_, i) => (
              <option key={i} value={i}>
                {getDatasetDisplayName(getDatasetName(debateData ?? null, i))}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="navigation-buttons">
        <Button
          buttonStyle="secondary"
          variant="outline"
          icon={ChevronLeft}
          iconPosition="start"
          label="Previous"
          size="md"
          onClick={onPrevious}
          disabled={currentIndex <= 0 || total === 0}
        />
        <Button
          buttonStyle="secondary"
          variant="outline"
          icon={ChevronRight}
          iconPosition="start"
          label="Next"
          size="md"
          onClick={onNext}
          disabled={currentIndex >= total - 1 || total === 0}
        />
      </div>
    </div>
  </div>
);

const AgentResponse = ({
  agentName,
  response,
  evaluation,
  roundIndex,
  isCollapsed,
  hasSwitched,
  onToggleCollapse,
  renderLatex,
  questionIndex,
}: {
  agentName: string;
  response: string;
  evaluation: EvaluationResult | undefined;
  roundIndex: number;
  isCollapsed: boolean;
  hasSwitched: boolean;
  onToggleCollapse: () => void;
  renderLatex: (text: string) => React.ReactNode;
  questionIndex: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset expansion when question changes
  useEffect(() => {
    setIsExpanded(false);
  }, [questionIndex]);

  // Calculate truncation once and memoize it
  const { truncatedResponse, canBeTruncated } = React.useMemo(() => {
    const lines = response.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length <= 2) {
      return { truncatedResponse: response, canBeTruncated: false };
    }
    return {
      truncatedResponse: lines.slice(0, 2).join("\n") + " ...",
      canBeTruncated: true,
    };
  }, [response]);

  const displayResponse = isExpanded ? response : truncatedResponse;

  let cardClass = "agent-response-card";
  if (evaluation) {
    if (evaluation.isCorrect) {
      cardClass += " correct";
    } else {
      cardClass += " incorrect";
    }
  }
  if (hasSwitched) {
    cardClass += " switched";
  }

  return (
    <div className={cardClass}>
      <div className="response-header">
        <div className="agent-info">
          <Brain />
          <h4>{agentName}</h4>
          {hasSwitched && (
            <span className="switch-badge">
              <TrendingDown />
              Switch
            </span>
          )}
        </div>
        <button onClick={onToggleCollapse} className="collapse-button">
          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          {isCollapsed ? <ChevronDown /> : <ChevronUp />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="response-content">
          <EvaluationBadge evaluation={evaluation} />
          {displayResponse ? (
            <>
              <div className="response-text">
                {renderLatex(displayResponse)}
              </div>
              {canBeTruncated && (
                <div className="expand-section">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`expand-button ${isExpanded ? "collapse" : ""}`}
                  >
                    {isExpanded ? (
                      <>
                        {/* <ChevronUp />
                        Show Less */}
                      </>
                    ) : (
                      <>
                        <ChevronDown />
                        Show Full Response
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div
              className="response-text"
              style={{
                textAlign: "center",
                fontStyle: "italic",
                color: "#94a3b8",
              }}
            >
              No response
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function DebateDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const debateId = params.id as string;
  const seed = searchParams.get("seed") || "default";

  // State
  const [activeTab, setActiveTab] = useState("questions");
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [selectedRun, setSelectedRun] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debateData, setDebateData] = useState<MultiRunDebateData | null>(null);
  const [collapsedAgents, setCollapsedAgents] = useState<{
    [key: string]: boolean;
  }>({});
  const [filteredQuestions, setFilteredQuestions] = useState<number[]>([]);
  const [evaluationResults, setEvaluationResults] = useState<{
    [key: string]: EvaluationResult;
  }>({});
  const [incorrectSwitches, setIncorrectSwitches] = useState<
    IncorrectSwitchQuestion[]
  >([]);
  const [katexLoaded, setKatexLoaded] = useState(false);

  // Load KaTeX
  useEffect(() => {
    if (!(window as any).katex) {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
      script.onload = () => setKatexLoaded(true);
      document.body.appendChild(script);

      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      document.head.appendChild(css);
    } else {
      setKatexLoaded(true);
    }
  }, []);

  useEffect(() => {
    const fetchDebate = async () => {
      try {
        if (!debateId) return;
        const response = await fetch(
          `/api/single-debate?experimentName=${encodeURIComponent(
            debateId
          )}&seed=${encodeURIComponent(seed)}`
        );
        const data = await response.json();
        setDebateData(data);
        setLoading(false);
      } catch (err) {
        setError("Failed to load debate data");
        console.error("Fetch error:", err);
        setLoading(false);
      }
    };
    fetchDebate();
  }, [debateId, seed]);

  const getCurrentRun = (): DebateRun | null => {
    if (!debateData) return null;
    if (Array.isArray(debateData.runs) && debateData.runs.length > 0) {
      return debateData.runs[selectedRun] || debateData.runs[0];
    }
    if (!Array.isArray(debateData.runs) && (debateData as any).result_data) {
      return debateData as unknown as DebateRun;
    }
    return null;
  };
  const currentRun = getCurrentRun();

  // Find incorrect switches
  const findIncorrectSwitches = (): IncorrectSwitchQuestion[] => {
    if (!currentRun?.result_data) return [];

    const switches: IncorrectSwitchQuestion[] = [];
    const taskName = inferDatasetFromTask(
      currentRun?.wandb_metadata?.parsed_args?.task,
      currentRun?.dataset_name
    ) as TaskName;

    const questions = safeGetQuestions(currentRun.result_data);
    questions.forEach((questionData, questionIndex) => {
      const rounds = questionData.debate_session?.rounds || [];
      if (rounds.length < 2) return;

      const agentNames = Object.keys(rounds[0].responses || {});
      agentNames.forEach((agentName) => {
        const agentEvaluations: boolean[] = rounds.map((round: any) => {
          try {
            const response = round.responses[agentName] || "";
            const evaluation = evaluateResponse(
              response,
              questionData.correct_answer,
              taskName
            );
            return evaluation.isCorrect;
          } catch {
            return false;
          }
        });

        for (let i = 1; i < agentEvaluations.length; i++) {
          if (agentEvaluations[i - 1] && !agentEvaluations[i]) {
            switches.push({
              questionIndex,
              agentName,
              switchedFromRound: i - 1,
              switchedToRound: i,
            });
          }
        }
      });
    });

    return switches;
  };

  // Update incorrect switches
  useEffect(() => {
    if (currentRun) {
      const switches = findIncorrectSwitches();
      setIncorrectSwitches(switches);
    }
  }, [currentRun, selectedRun]);

  // Update evaluation results
  useEffect(() => {
    if (!currentRun?.result_data?.[selectedQuestion]) return;

    const newEvaluationResults: { [key: string]: EvaluationResult } = {};
    const questionData = currentRun.result_data[selectedQuestion];
    const taskName = inferDatasetFromTask(
      currentRun.wandb_metadata?.parsed_args?.task,
      currentRun.dataset_name
    ) as TaskName;

    questionData.debate_session?.rounds?.forEach(
      (round: any, roundIndex: number) => {
        Object.entries(round.responses).forEach(([agentName, response]) => {
          const key = `${agentName}_${roundIndex}`;
          newEvaluationResults[key] = evaluateResponse(
            response as string,
            questionData.correct_answer,
            taskName
          );
        });
      }
    );

    setEvaluationResults(newEvaluationResults);
  }, [selectedQuestion, selectedRun, currentRun]);

  // Filter questions
  useEffect(() => {
    if (!currentRun?.result_data) {
      setFilteredQuestions([]);
      return;
    }

    const questionsSafe = safeGetQuestions(currentRun.result_data);
    let questions = questionsSafe.map((_, index) => index);

    // Apply analysis filter (incorrect switches only)
    if (activeTab === "filter-incorrect") {
      const switchQuestions = [
        ...new Set(incorrectSwitches.map((s) => s.questionIndex)),
      ];
      questions = questions.filter((index) => switchQuestions.includes(index));
    }

    setFilteredQuestions(questions);

    // Reset to first question if current question is not in filtered list
    if (questions.length > 0 && !questions.includes(selectedQuestion)) {
      setSelectedQuestion(questions[0]);
    }
  }, [currentRun, activeTab, selectedQuestion, selectedRun, incorrectSwitches]);

  // Reset on run change
  useEffect(() => {
    setSelectedQuestion(0);
  }, [selectedRun]);

  const renderLatex = (text: string) => {
    if (!katexLoaded || !(window as any).katex) {
      return <span>{text}</span>;
    }

    const latexRegex =
      /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$/g;

    let lastIndex = 0;
    let match;
    const parts: React.ReactNode[] = [];
    let partKey = 0;

    while ((match = latexRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const normalText = text.substring(lastIndex, match.index);
        parts.push(...processBold(normalText, partKey));
        partKey += normalText.length;
      }

      const latex = match[1] || match[2] || match[3] || match[4];
      const isDisplay = !!(match[1] || match[3]);

      try {
        const html = (window as any).katex.renderToString(latex, {
          displayMode: isDisplay,
          throwOnError: false,
          output: "html",
        });
        parts.push(
          <span
            key={`latex-${partKey++}`}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              display: isDisplay ? "block" : "inline",
              margin: isDisplay ? "0.5em 0" : "0",
            }}
          />
        );
      } catch (err) {
        parts.push(
          <span
            key={`latex-error-${partKey++}`}
            style={{
              color: "#b91c1c",
              fontFamily: "monospace",
            }}
          >
            {match[0]}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      parts.push(...processBold(remainingText, partKey));
    }

    return <>{parts}</>;
  };

  const getStartingRound = (): number => {
    if (!currentRun?.performance_data || !Array.isArray(currentRun.performance_data)) {
      return 1;
    }
    
    // Get the first round number from performance_data
    const firstPerfRound = currentRun.performance_data[0];
    if (firstPerfRound) {
      const roundKey = Object.keys(firstPerfRound)[0];
      const match = roundKey.match(/round_(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return 1;
  };

const startingRound = getStartingRound();
  const processBold = (text: string, startKey: number): React.ReactNode[] => {
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = startKey;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${keyIndex++}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      parts.push(<strong key={`bold-${keyIndex++}`}>{match[1]}</strong>);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${keyIndex++}`}>{text.substring(lastIndex)}</span>
      );
    }

    return parts;
  };

  const handlePrevious = () => {
    const currentIndex = filteredQuestions.indexOf(selectedQuestion);
    if (currentIndex > 0) {
      setSelectedQuestion(filteredQuestions[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    const currentIndex = filteredQuestions.indexOf(selectedQuestion);
    if (currentIndex < filteredQuestions.length - 1) {
      setSelectedQuestion(filteredQuestions[currentIndex + 1]);
    }
  };

  // Loading/Error states
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!debateData?.runs || debateData.runs.length === 0) {
    return <ErrorState error="No debate data found." />;
  }
  if (!currentRun) return null;

  const parsedArgs = currentRun.wandb_metadata?.parsed_args || {};
  const numRounds = (parsedArgs as any)["checkpoint.frequency"]
    ? (parsedArgs["experiment.num_rounds"] || 0) + 1
    : parsedArgs["experiment.num_rounds"] || 0;
  const experimentName = parsedArgs["experiment.name"] || "Experiment";
  const actualAgentNames = currentRun.result_data?.[0]?.debate_session
    ?.rounds?.[0]?.responses
    ? Object.keys(currentRun.result_data[0].debate_session.rounds[0].responses)
    : [];

  const currentQuestionData = currentRun.result_data?.[selectedQuestion];
  const currentQuestionIndex = filteredQuestions.indexOf(selectedQuestion);
  const currentQuestionSwitches = incorrectSwitches.filter(
    (s) => s.questionIndex === selectedQuestion
  );

  const totalRuns = debateData?.runs?.length || 0;
  const tabs = [
    { id: "questions", label: "Debates", icon: Scale },
    { id: "filter-incorrect", label: "Analysis", icon: TrendingDown },
    { id: "performance", label: "Performance", icon: Trophy },
  ];

  return (
    <div className="debate-details-page">
      {/* Header */}
      <div className="debate-header">
        <div className="header-content">
          <button onClick={() => window.history.back()} className="back-button">
            <ArrowLeft />
            Back to Dashboard
          </button>
          <h1 className="header-title">{experimentName}</h1>
        </div>
      </div>

      <div className="debate-container">
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <div className="tabs-container">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button ${
                    activeTab === tab.id ? "active" : ""
                  }`}
                >
                  <Icon />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {(activeTab === "questions" || activeTab === "filter-incorrect") && (
          <div>
            <QuestionNavigator
              currentIndex={currentQuestionIndex}
              total={filteredQuestions.length}
              onPrevious={handlePrevious}
              onNext={handleNext}
              showRunFilter={activeTab === "questions"}
              selectedRun={selectedRun}
              totalRuns={totalRuns}
              onRunChange={setSelectedRun}
              debateData={debateData ?? null}
            />

            {filteredQuestions.length === 0 ? (
              <div className="empty-state">
                <AlertCircle />
                <h3>
                  {activeTab === "filter-incorrect"
                    ? "No Incorrect Switches Found"
                    : "No Questions Found"}
                </h3>
                <p>
                  {activeTab === "filter-incorrect"
                    ? "There are no questions where agents switched from correct to incorrect answers."
                    : "No questions match the current filter."}
                </p>
              </div>
            ) : (
              currentQuestionData && (
                <>
                  {/* Question Display */}
                  <div className="content-card">
                    <div className="card-header">
                      <h3>Question {selectedQuestion + 1}</h3>
                    </div>

                    {activeTab === "filter-incorrect" &&
                      currentQuestionSwitches.length > 0 && (
                        <div className="switch-warning">
                          <div className="warning-header">
                            <AlertCircle />
                            Incorrect Switches
                          </div>
                          <div className="switch-list">
                            {currentQuestionSwitches.map((switchInfo, idx) => (
                              <div key={idx} className="switch-item">
                                <span className="agent-name">
                                  {switchInfo.agentName}
                                </span>{" "}
                                switched from correct (Round{" "}
                                {switchInfo.switchedFromRound + 1}) to incorrect
                                (Round {switchInfo.switchedToRound + 1})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    <div className="question-content">
                      <div className="question-text">
                        <div className="question-body">
                          {currentQuestionData.question}
                        </div>
                      </div>
                      <div className="correct-answer">
                        <h4>Correct Answer:</h4>
                        <div className="answer-body">
                          {renderLatex(currentQuestionData.correct_answer)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Agent Responses */}
                  <div className="content-card">
                    <div className="card-header">
                      <h3>Agent Responses</h3>
                    </div>

                    <div className="rounds-container">
                      {currentQuestionData.debate_session?.rounds?.map((round: any, roundIndex: number) => {
                      const actualRoundNumber = startingRound + roundIndex;
                      const isLastRoundInData = roundIndex === currentQuestionData.debate_session.rounds.length - 1;
                                            
                      return (
                        <div key={roundIndex} className="round-section">
                          <h4 className="round-header">
                            Round {actualRoundNumber}
                            {isLastRoundInData && (
                              <span className="round-label">(Final)</span>
                            )}
                          </h4>

                            <div className="responses-grid">
                              {actualAgentNames.map((agentName) => {
                                const response = round.responses[agentName] || "";
                                const evaluationKey = `${agentName}_${roundIndex}`;
                                const evaluation = evaluationResults[evaluationKey];
                                const hasSwitched = currentQuestionSwitches.some(
                                  (s) =>
                                    s.agentName === agentName &&
                                    (s.switchedFromRound === roundIndex ||
                                      s.switchedToRound === roundIndex)
                                );

                                return (
                                  <AgentResponse
                                    key={evaluationKey}
                                    agentName={agentName}
                                    response={response}
                                    evaluation={evaluation}
                                    roundIndex={roundIndex}
                                    isCollapsed={collapsedAgents[evaluationKey] || false}
                                    hasSwitched={hasSwitched}
                                    questionIndex={selectedQuestion}
                                    onToggleCollapse={() =>
                                      setCollapsedAgents((prev) => ({
                                        ...prev,
                                        [evaluationKey]: !prev[evaluationKey],
                                      }))
                                    }
                                    renderLatex={renderLatex}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === "performance" && (
        <div className="content-card">
          <div className="card-header">
            <BarChart3 />
            <h3>Performance Over Rounds</h3>
          </div>
          <div className="performance-grid">
            {currentRun.performance_data?.map((roundObj: any, index: number) => {
              // Get the round key (e.g., "round_3")
              const roundKey = Object.keys(roundObj)[0];
              const roundData = roundObj[roundKey] || {};
              const roundNumber = parseInt(roundKey.replace('round_', ''));
              const majorityVote = roundData.majority_vote ?? 0;

              return (
                <div key={roundKey} className="performance-round">
                  <div className="round-title-bar">
                    <span className="round-label">Round {roundNumber}</span>
                    <span className="majority-score">
                      {(majorityVote * 100).toFixed(1)}% Majority Vote
                    </span>
                  </div>
                  <div className="agents-performance">
                    {Object.entries(roundData)
                      .filter(([key]) => key !== "majority_vote")
                      .map(([agentKey, score]) => (
                        <div key={agentKey} className="agent-score-card">
                          <span className="agent-label">{agentKey}</span>
                          <span className="score-value">
                            {((score as number) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
