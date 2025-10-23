import React, { useState, useEffect } from "react";
import { Send, X, Bot, Clock } from "lucide-react";

interface HumanInputModalProps {
  isOpen: boolean;
  questionData: {
    question_text?: string;
    question_prompt?: string;
    round_number?: number;
    agent_index?: number;
    previous_responses?: string[];
  };
  onSubmit: (responseText: string, extractedAnswer: string) => void;
  onClose: () => void;
}

const HumanInputModal: React.FC<HumanInputModalProps> = ({
  isOpen,
  questionData,
  onSubmit,
  onClose,
}) => {
  const [responseText, setResponseText] = useState("");
  const [extractedAnswer, setExtractedAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [katexLoaded, setKatexLoaded] = useState(false);

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

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!responseText.trim()) {
      alert("Please enter a response");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(responseText, extractedAnswer);
      setResponseText("");
      setExtractedAnswer("");
    } catch (error) {
      console.error("Error submitting response:", error);
      alert("Failed to submit response. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const parseResponse = (resp: string) => {
    const match = resp.match(/^(\[Round \d+\] )?(.+?):\s*(.+)$/s);
    if (match) {
      return {
        prefix: match[1] || "",
        agentName: match[2],
        response: match[3],
      };
    }
    return {
      prefix: "",
      agentName: "Agent",
      response: resp,
    };
  };

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
  const convertFractionsToLatex = (text: string) => {
    return text.replace(/\b(\d+)\/(\d+)\b/g, (_, numerator, denominator) => {
      return `\\frac{${numerator}}{${denominator}}`;
    });
  };
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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          maxWidth: "900px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: "white",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Clock size={24} />
              Your Turn to Respond
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "rgba(255, 255, 255, 0.9)",
                marginTop: "0.25rem",
              }}
            >
              Round {(questionData.round_number ?? 0) + 1} - Agent{" "}
              {questionData.agent_index ?? 0}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "white",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.3)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.2)")
            }
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "1.5rem" }}>
          {/* Question Display */}
          {questionData.question_text && (
            <div
              style={{
                backgroundColor: "#fef3c7",
                padding: "1rem",
                borderRadius: "0.5rem",
                marginBottom: "1.5rem",
                border: "2px solid #fbbf24",
              }}
            >
              <h3
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#92400e",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Question:
              </h3>
              <div
                style={{
                  fontSize: "0.9375rem",
                  color: "#1f2937",
                  lineHeight: "1.6",
                  fontWeight: "500",
                }}
              >
                {convertFractionsToLatex(questionData.question_text || "")}
              </div>
            </div>
          )}

          {/* Question Prompt (if different) */}
          {questionData.question_prompt &&
            questionData.question_prompt !== questionData.question_text && (
              <div
                style={{
                  backgroundColor: "#dbeafe",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  marginBottom: "1.5rem",
                  border: "1px solid #3b82f6",
                }}
              >
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    color: "#1e40af",
                    marginBottom: "0.5rem",
                  }}
                >
                  Full Prompt:
                </h3>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#1f2937",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {convertFractionsToLatex(questionData.question_prompt || "")}
                </div>
              </div>
            )}

          {/* Previous Responses */}
          {questionData.previous_responses &&
            questionData.previous_responses.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    color: "#374151",
                    marginBottom: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Bot size={16} />
                  AI Agent Responses ({questionData.previous_responses.length}):
                </h3>
                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.5rem",
                    backgroundColor: "#fafafa",
                  }}
                >
                  {questionData.previous_responses.map((resp, idx) => {
                    const parsed = parseResponse(resp);
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: "0.875rem",
                          marginBottom:
                            idx < questionData.previous_responses!.length - 1
                              ? "0"
                              : 0,
                          borderBottom:
                            idx < questionData.previous_responses!.length - 1
                              ? "1px solid #e5e7eb"
                              : "none",
                          backgroundColor: idx % 2 === 0 ? "white" : "#fafafa",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#6b7280",
                            marginBottom: "0.5rem",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Bot size={14} />
                          <span style={{ color: "#2563eb" }}>
                            {parsed.agentName}
                          </span>
                          {parsed.prefix && (
                            <span
                              style={{
                                backgroundColor: "#dbeafe",
                                padding: "0.125rem 0.5rem",
                                borderRadius: "9999px",
                                fontSize: "0.6875rem",
                              }}
                            >
                              {parsed.prefix.replace(/[\[\]]/g, "")}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.875rem",
                            color: "#111827",
                            lineHeight: "1.6",
                            whiteSpace: "pre-wrap",
                            paddingLeft: "1.5rem",
                          }}
                        >
                          {renderLatex(parsed.response)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Response Input */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Your Response <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Enter your reasoning and response here."
              rows={8}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "2px solid #d1d5db",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
            />
            <p
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
              }}
            ></p>
          </div>

          {/* Extracted Answer Input */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Final Answer
            </label>
            <input
              type="text"
              value={extractedAnswer}
              onChange={(e) => setExtractedAnswer(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "2px solid #d1d5db",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#667eea")}
              onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
            />
            <p
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
              }}
            >
              Extract your final answer if applicable (e.g., for multiple
              choice, enter just the letter like "A")
            </p>
          </div>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "flex-end",
              paddingTop: "0.5rem",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                backgroundColor: "white",
                color: "#374151",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.5 : 1,
                transition: "background-color 0.2s",
              }}
              onMouseOver={(e) =>
                !isSubmitting &&
                (e.currentTarget.style.backgroundColor = "#f9fafb")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "white")
              }
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !responseText.trim()}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                border: "none",
                background:
                  isSubmitting || !responseText.trim()
                    ? "#d1d5db"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor:
                  isSubmitting || !responseText.trim()
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseOver={(e) => {
                if (!isSubmitting && responseText.trim()) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {isSubmitting ? (
                <>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid white",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Submit Response
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default HumanInputModal;
