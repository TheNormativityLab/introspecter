"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  MessageSquare,
  FileText,
  Settings,
  Brain,
  User,
  PlayCircle,
  Clock,
  CheckCircle,
  Plus,
  Trash2,
  ArrowLeft,
  AlertTriangle,
  Terminal,
} from "lucide-react";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";
import "./NewDebatePage.scss";

interface AgentConfig {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface CustomQuestion {
  question: string;
  correctAnswer: string;
}

interface DebateFormData {
  experimentName: string;
  numQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: AgentConfig[];
  customQuestions: CustomQuestion[];
  selectedDatasets: string[];
}

export default function NewDebatePage() {
  const [formData, setFormData] = useState<DebateFormData>({
    experimentName: "",
    numQuestions: 1,
    numRounds: 3,
    seeds: [],
    agents: [
      { id: "agent1", name: "Agent 1", model: "gpt_4o_mini", enabled: true },
    ],
    customQuestions: [],
    selectedDatasets: [],
  });

  const [isCreating, setIsCreating] = useState(false);
  const [createdDebateData, setCreatedDebateData] = useState<any>(null);
  const [showCustomQuestions, setShowCustomQuestions] = useState(false);
  const [showProgressMonitor, setShowProgressMonitor] = useState(false);

  const availableModels = ["gpt_4o_mini", "gpt_3_5_turbo", "mistral-7b", "llama_3_1_8B", "human-participant"];

  const availableDatasets = [
    { value: "gsm8k", label: "GSM8K (Math Word Problems)" },
    { value: "mmlu", label: "MMLU (Massive Multitask Language Understanding)" },
    { value: "custom", label: "Custom Questions" },
  ];
  const router = useRouter();
  const MAX_QUESTIONS = 100;
  const MAX_ROUNDS = 3;

  const isQuestionsExceeded = () => formData.numQuestions > MAX_QUESTIONS;
  const isRoundsExceeded = () => formData.numRounds > MAX_ROUNDS;

  const handleBackToDashboard = () => {
    if (showProgressMonitor) {
      setShowProgressMonitor(false);
      setCreatedDebateData(null);
    } else {
      window.history.back();
    }
  };

  const addAgent = () => {
    const newAgentId = `agent${Date.now()}`;
    const newAgent: AgentConfig = {
      id: newAgentId,
      name: `Agent ${formData.agents.length + 1}`,
      model: "gpt_4o_mini",
      enabled: true,
    };

    setFormData((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
    }));
  };

  const removeAgent = (agentId: string) => {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.filter((agent) => agent.id !== agentId),
    }));
  };

  const updateAgent = (index: number, updates: Partial<AgentConfig>) => {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.map((agent, i) =>
        i === index ? { ...agent, ...updates } : agent
      ),
    }));
  };

  const toggleDataset = (datasetValue: string) => {
    if (datasetValue === "custom") {
      setShowCustomQuestions((prev) => {
        const newState = !prev;

        if (newState && formData.customQuestions.length === 0) {
          setFormData((prevData) => ({
            ...prevData,
            customQuestions: [{ question: "", correctAnswer: "" }],
          }));
        }

        if (!newState) {
          setFormData((prevData) => ({
            ...prevData,
            customQuestions: [],
          }));
        }

        return newState;
      });
    }

    setFormData((prev) => ({
      ...prev,
      selectedDatasets: prev.selectedDatasets.includes(datasetValue)
        ? prev.selectedDatasets.filter((d) => d !== datasetValue)
        : [...prev.selectedDatasets, datasetValue],
    }));
  };

  const addCustomQuestion = () => {
    setFormData((prev) => ({
      ...prev,
      customQuestions: [
        ...prev.customQuestions,
        { question: "", correctAnswer: "" },
      ],
    }));
  };

  const updateCustomQuestion = (
    index: number,
    field: "question" | "correctAnswer",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      customQuestions: prev.customQuestions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q
      ),
    }));
  };

  const removeCustomQuestion = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      customQuestions: prev.customQuestions.filter((_, i) => i !== index),
    }));
  };

  const getEnabledAgents = () =>
    formData.agents.filter((agent) => agent.enabled);

  const getTotalQuestions = () => {
    const datasetCount = formData.selectedDatasets.filter(
      (d) => d !== "custom"
    ).length;

    const datasetQuestions = formData.numQuestions * datasetCount;
    const customQuestions = formData.customQuestions.filter(
      (q) => q.question.trim() !== ""
    ).length;
    return datasetQuestions + customQuestions;
  };

  const isFormValid = () => {
    const hasName = formData.experimentName.trim() !== "";
    const hasValidNumbers = formData.numQuestions > 0 && formData.numRounds > 0;
    const hasAgents = getEnabledAgents().length >= 1;
    const hasDatasets =
      formData.selectedDatasets.filter((d) => d !== "custom").length > 0 ||
      formData.customQuestions.some((q) => q.question.trim() !== "");
    const withinLimits = !isQuestionsExceeded() && !isRoundsExceeded();

    return (
      hasName && hasValidNumbers && hasAgents && hasDatasets && withinLimits
    );
  };

  const handleCreateDebate = async () => {
    setIsCreating(true);

    try {
      const debateData = {
        experimentName: formData.experimentName,
        totalQuestions: getTotalQuestions(),
        numRounds: formData.numRounds,
        seeds: formData.seeds.length > 0 ? formData.seeds : [1],
        agents: getEnabledAgents(),
        selectedDatasets: formData.selectedDatasets.filter(
          (d) => d !== "custom"
        ),
        customQuestions: formData.customQuestions.filter((q) =>
          q.question.trim()
        ),
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setCreatedDebateData(debateData);
      setShowProgressMonitor(true);
    } catch (error) {
      console.error("Failed to prepare debate:", error);
      alert("Failed to prepare debate. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  if (showProgressMonitor && createdDebateData) {
    return (
      <DebateProgressMonitor
        debateData={createdDebateData}
        onBackDashboard={() => router.push("/dashboard")}
        onBack={() => setShowProgressMonitor(false)}
      />
    );
  }

  return (
    <div className="debate-form">
      {/* Header */}
      <div className="form-header">
        <div className="header-content">
          <button onClick={handleBackToDashboard} className="back-button">
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
          <div className="header-main">
            <div>
              <h1 className="header-title">Create New Debate</h1>
              <p className="header-subtitle">
                Set up a new debate experiment with AI agents or human
                participants
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="form-container">
        <div className="form-card">
          {/* Basic Setup Section */}
          <div className="section">
            <div className="section-header">
              <div className="section-header-left">
                <Settings className="section-icon" />
                <h2 className="section-title">Basic Setup</h2>
              </div>
            </div>

            <div className="form-grid">
              <div className="input-group full-width">
                <label className="input-label">Experiment Name</label>
                <input
                  type="text"
                  value={formData.experimentName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      experimentName: e.target.value,
                    }))
                  }
                  placeholder="Enter a name for your debate experiment"
                  className="modern-input"
                />
              </div>

              <div className="input-row">
                <div className="input-group">
                  <label className="input-label">Questions</label>
                  <input
                    type="number"
                    min="1"
                    max={MAX_QUESTIONS}
                    value={formData.numQuestions}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        numQuestions: parseInt(e.target.value) || 1,
                      }))
                    }
                    className={`modern-input ${
                      isQuestionsExceeded() ? "error" : ""
                    }`}
                  />
                  <p className="input-help">
                    Number of questions to use from each selected dataset
                  </p>
                  {isQuestionsExceeded() && (
                    <div className="error-message">
                      <AlertTriangle className="w-4 h-4" />
                      Maximum {MAX_QUESTIONS.toLocaleString()} questions allowed
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label className="input-label">Number of Rounds</label>
                  <input
                    type="number"
                    min="1"
                    max={MAX_ROUNDS}
                    value={formData.numRounds}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        numRounds: parseInt(e.target.value) || 1,
                      }))
                    }
                    className={`modern-input ${
                      isRoundsExceeded() ? "error" : ""
                    }`}
                  />
                  {isRoundsExceeded() && (
                    <div className="error-message">
                      <AlertTriangle className="w-4 h-4" />
                      Maximum {MAX_ROUNDS} rounds allowed
                    </div>
                  )}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Random Seed</label>
                <div className="checkbox-group">
                  {[0, 1, 2, 3, 4].map((seed) => (
                    <label key={seed} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={formData.seeds.includes(seed)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData((prev) => ({
                              ...prev,
                              seeds: [...prev.seeds, seed].sort(),
                            }));
                          } else {
                            setFormData((prev) => ({
                              ...prev,
                              seeds: prev.seeds.filter((s) => s !== seed),
                            }));
                          }
                        }}
                        className="modern-checkbox"
                      />
                      <span>{seed}</span>
                    </label>
                  ))}
                </div>
                <p className="input-help">
                  Select one or more seeds (1-4) for reproducible random
                  sampling
                </p>
              </div>
            </div>
          </div>

          {/* Agent Configuration Section */}
          <div className="section">
            <div className="section-header">
              <div className="section-header-left">
                <Brain className="section-icon" />
                <h2 className="section-title">Configure Agents</h2>
              </div>
              <div className="section-header-right">
                <span className="agent-count">
                  {getEnabledAgents().length} agents enabled
                </span>
                <button onClick={addAgent} className="add-button">
                  <Plus className="w-4 h-4" />
                  Add Agent
                </button>
              </div>
            </div>

            <div className="agents-list">
              {formData.agents.map((agent, index) => (
                <div
                  key={agent.id}
                  className={`agent-card ${
                    agent.enabled ? "enabled" : "disabled"
                  }`}
                >
                  <div className="agent-header">
                    <div className="agent-toggle">
                      <input
                        type="checkbox"
                        checked={agent.enabled}
                        onChange={(e) =>
                          updateAgent(index, { enabled: e.target.checked })
                        }
                        className="modern-checkbox"
                      />
                      <input
                        type="text"
                        value={agent.name}
                        onChange={(e) =>
                          updateAgent(index, { name: e.target.value })
                        }
                        className="agent-name-input"
                      />
                    </div>
                    <div className="agent-actions">
                      {agent.enabled && agent.model === "human-participant" && (
                        <span className="human-badge">Human</span>
                      )}
                      {formData.agents.length > 1 && (
                        <button
                          onClick={() => removeAgent(agent.id)}
                          className="remove-button"
                          title="Remove agent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {agent.enabled && (
                    <div className="agent-config">
                      <label className="input-label">Model</label>
                      <select
                        value={agent.model}
                        onChange={(e) =>
                          updateAgent(index, {
                            model: e.target.value,
                            isHuman: e.target.value === "human-participant",
                          })
                        }
                        className="modern-select"
                      >
                        {availableModels.map((model) => (
                          <option key={model} value={model}>
                            {model === "human-participant"
                              ? "Human Participant"
                              : model}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {getEnabledAgents().length < 1 && (
              <div className="warning-message">
                At least 1 agent must be enabled to create a debate.
              </div>
            )}
          </div>

          {/* Dataset Selection Section */}
          <div className="section">
            <div className="section-header">
              <div className="section-header-left">
                <FileText className="section-icon" />
                <h2 className="section-title">Dataset Selection</h2>
              </div>
            </div>
            <div className="dataset-section">
              <label className="input-label">
                Choose Datasets (can select multiple)
              </label>
              <p className="input-help">
                Select one or more datasets. Each dataset will contribute{" "}
                {formData.numQuestions}{" "}
                {formData.numQuestions === 1 ? "question" : "questions"} to the
                debate.
              </p>
              <div className="dataset-list">
                {availableDatasets.map((dataset) => (
                  <label
                    key={dataset.value}
                    className={`dataset-item ${
                      formData.selectedDatasets.includes(dataset.value)
                        ? "selected"
                        : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.selectedDatasets.includes(
                        dataset.value
                      )}
                      onChange={() => toggleDataset(dataset.value)}
                      className="modern-checkbox"
                    />
                    <div className="dataset-content">
                      <span className="dataset-label">{dataset.label}</span>
                      {dataset.value === "custom" &&
                        formData.customQuestions.filter((q) =>
                          q.question.trim()
                        ).length > 0 && (
                          <span className="dataset-meta">
                            {
                              formData.customQuestions.filter((q) =>
                                q.question.trim()
                              ).length
                            }{" "}
                            custom questions
                          </span>
                        )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom Questions Section */}
            {showCustomQuestions &&
              formData.selectedDatasets.includes("custom") && (
                <div className="custom-questions-section">
                  <div className="custom-questions-header">
                    <h3>Custom Questions</h3>
                    <button
                      onClick={addCustomQuestion}
                      className="add-question-button"
                    >
                      <Plus className="w-4 h-4" />
                      Add Question
                    </button>
                  </div>
                  <p className="input-help">
                    Add your own custom questions with correct answers in
                    addition to the selected datasets.
                  </p>

                  <div className="questions-list">
                    {formData.customQuestions.map((questionObj, index) => (
                      <div key={index} className="question-item">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "12px",
                            width: "100%",
                          }}
                        >
                          <span className="question-number">{index + 1}</span>
                          <div
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            <div>
                              <label
                                className="input-label"
                                style={{
                                  fontSize: "0.875rem",
                                  marginBottom: "4px",
                                }}
                              >
                                Question
                              </label>
                              <textarea
                                value={questionObj.question}
                                onChange={(e) =>
                                  updateCustomQuestion(
                                    index,
                                    "question",
                                    e.target.value
                                  )
                                }
                                placeholder="Enter your custom question..."
                                rows={3}
                                className="modern-textarea"
                              />
                            </div>
                            <div>
                              <label
                                className="input-label"
                                style={{
                                  fontSize: "0.875rem",
                                  marginBottom: "4px",
                                }}
                              >
                                Correct Answer
                              </label>
                              <input
                                type="text"
                                value={questionObj.correctAnswer}
                                onChange={(e) =>
                                  updateCustomQuestion(
                                    index,
                                    "correctAnswer",
                                    e.target.value
                                  )
                                }
                                placeholder="Enter the correct answer..."
                                className="modern-input"
                              />
                            </div>
                          </div>
                          {formData.customQuestions.length > 1 && (
                            <button
                              onClick={() => removeCustomQuestion(index)}
                              className="remove-question-button"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Summary Section */}
          <div className="summary-section">
            <h3 className="summary-title">Configuration Summary</h3>

            <div className="summary-grid">
              <div className="summary-column">
                <h4>Basic Settings</h4>
                <ul className="summary-list">
                  <li>
                    <strong>Name:</strong>{" "}
                    {formData.experimentName || "Not set"}
                  </li>
                  <li>
                    <strong>Total Questions:</strong> {getTotalQuestions()} (
                    {formData.numQuestions} per selected dataset)
                  </li>
                  <li>
                    <strong>Rounds:</strong> {formData.numRounds}
                  </li>
                  {formData.seeds.length > 0 && (
                    <li>
                      <strong>Seeds:</strong> {formData.seeds.join(", ")}
                    </li>
                  )}
                  <li>
                    <strong>Datasets:</strong>{" "}
                    {formData.selectedDatasets.filter((d) => d !== "custom")
                      .length > 0
                      ? formData.selectedDatasets
                          .filter((d) => d !== "custom")
                          .map(
                            (d) =>
                              availableDatasets.find((ds) => ds.value === d)
                                ?.label
                          )
                          .join(", ")
                      : "None selected"}
                  </li>
                  {formData.customQuestions.filter((q) => q.question.trim())
                    .length > 0 && (
                    <li>
                      <strong>Custom Questions:</strong>{" "}
                      {
                        formData.customQuestions.filter((q) =>
                          q.question.trim()
                        ).length
                      }
                    </li>
                  )}
                </ul>
              </div>

              <div className="summary-column">
                <h4>Agents ({getEnabledAgents().length})</h4>
                <ul className="summary-list">
                  {getEnabledAgents().map((agent) => (
                    <li key={agent.id} className="agent-summary">
                      {agent.model === "human-participant" ? (
                        <User className="w-4 h-4 text-green-600" />
                      ) : (
                        <Brain className="w-4 h-4 text-blue-600" />
                      )}
                      <strong>{agent.name}:</strong> <span>{agent.model}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Create Button */}
        <div className="form-footer">
          <button
            onClick={handleCreateDebate}
            disabled={isCreating || !isFormValid()}
            className="create-button"
          >
            <PlayCircle className="w-5 h-5" />
            <span>{isCreating ? "Creating..." : "Create Debate"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
