import React, { useState, useEffect, useRef } from "react";
import { Send, X, Bot, User, Sparkles } from "lucide-react";

interface PreviousRounds {
  [roundKey: string]: {
    [agentName: string]: string;
  };
}

interface HumanInputModalProps {
  isOpen: boolean;
  questionData: {
    question_text?: string;
    question_prompt?: string;
    round_number?: number;
    agent_index?: number;
    previous_responses?: string[] | { [key: string]: string };
    previous_rounds?: PreviousRounds;
    history?: any[];
    replace_agent_name?: string;
    replaced_agent_specific_name?: string;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [katexLoaded, setKatexLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!(window as any).katex) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
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
    if (!responseText.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(responseText, "");
      setResponseText("");
    } catch (error) {
      console.error("Error submitting response:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAgentName = (agentName: string): string => {
    if (!agentName) return "Unknown Agent";
    const parts = agentName.split('_agent_');
    if (parts.length === 2) {
      const modelName = parts[0]
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return `${modelName} (Agent ${parts[1]})`;
    }
    return agentName;
  };

  const isReplacedAgent = (agentName: string): boolean => {
    if (questionData.replaced_agent_specific_name) {
      return agentName === questionData.replaced_agent_specific_name;
    }
    if (!questionData.replace_agent_name) return false;
    
    const agentModel = agentName.split('_agent_')[0].toLowerCase();
    const replacedModel = questionData.replace_agent_name.toLowerCase().replace(/_/g, '-');
    return agentModel === replacedModel || agentName.includes(replacedModel);
  };

  const renderLatex = (text: string) => {
    if (!text) return null;
    if (!text.includes('\\') && !text.includes('$')) return <span style={{whiteSpace: "pre-wrap"}}>{text}</span>;
    const parts = text.split(/(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?:\$\$[\s\S]*?\$\$)|(?:\$[^\$\n]+?\$))/g);

    return (
      <span style={{whiteSpace: "pre-wrap"}}>
        {parts.map((part, index) => {
          if (part.startsWith('\\[') || part.startsWith('\\(') || part.startsWith('$$') || part.startsWith('$')) {
            let math = part;
            let displayMode = false;

            if (part.startsWith('\\[')) {
              math = part.slice(2, -2);
              displayMode = true;
            } else if (part.startsWith('\\(')) {
              math = part.slice(2, -2);
            } else if (part.startsWith('$$')) {
              math = part.slice(2, -2);
              displayMode = true;
            } else if (part.startsWith('$')) {
              math = part.slice(1, -1);
            }

            try {
              if (katexLoaded && (window as any).katex) {
                const html = (window as any).katex.renderToString(math, {
                  displayMode,
                  throwOnError: false,
                  output: "html",
                });
                return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
              }
            } catch (e) {
              return <span key={index}>{part}</span>;
            }
          }
          
          if (part.includes('\\boxed{')) {
             const boxedParts = part.split(/(\\boxed\{[^}]+\})/g);
             return (
                <span key={index}>
                    {boxedParts.map((bp, bpi) => {
                        if (bp.startsWith('\\boxed{')) {
                            const content = bp.slice(7, -1);
                            return (
                                <span key={bpi} className="border border-black px-1 mx-1 inline-block">
                                    {content}
                                </span>
                            )
                        }
                        return <span key={bpi}>{bp}</span>
                    })}
                </span>
             )
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  const getPreviousRoundsData = () => {
    if (questionData.previous_rounds && Object.keys(questionData.previous_rounds).length > 0) {
      return Object.entries(questionData.previous_rounds)
        .sort(([keyA], [keyB]) => {
          const numA = parseInt(keyA.split('_')[1] || '0');
          const numB = parseInt(keyB.split('_')[1] || '0');
          return numA - numB;
        });
    }
    if (questionData.previous_responses && !Array.isArray(questionData.previous_responses) && typeof questionData.previous_responses === 'object') {
        return [["Current Context", questionData.previous_responses as {[key: string]: string}]];
    }

    if (Array.isArray(questionData.previous_responses) && questionData.previous_responses.length > 0) {
        const responses: {[key: string]: string} = {};
        questionData.previous_responses.forEach((resp, idx) => {
            responses[`Agent ${idx}`] = resp;
        });
        return [["Previous Responses", responses]];
    }

    return [];
  };

  const previousRoundsData = getPreviousRoundsData();

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              Human Intervention Required
            </h2>
            <p className="text-sm text-slate-500">
              Round {(questionData.round_number ?? 0) + 1} • Agent {questionData.agent_index ?? 0} Turn
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30 scrollbar-thin scrollbar-thumb-slate-200">
          {questionData.question_text && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">Original Question</h3>
              <div className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                {questionData.question_text}
              </div>
            </div>
          )}

          {previousRoundsData.length === 0 ? (
              (questionData.round_number ?? 0) > 0 && (
                <div className="text-center text-slate-400 italic py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    Waiting for previous responses...
                </div>
              )
          ) : (
              previousRoundsData.map(([roundKey, responses]) => {
                const roundNum = typeof roundKey === "string" ? parseInt(roundKey.split('_')[1] || '0') : 0;
                const headerText = isNaN(roundNum) ? roundKey : `Round ${roundNum + 1}`;

                return (
                <div key={String(roundKey)} className="relative">
                    <div className="sticky top-0 flex justify-center mb-4 z-10">
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                           {typeof headerText === "string" ? headerText : JSON.stringify(headerText)}
                        </span>
                    </div>
                    <div className="space-y-6">
                    {Object.entries(responses).map(([agentName, response]) => {
                        const responseStr = String(response);
                        const isYou = isReplacedAgent(agentName);
                        
                        return (
                        <div key={agentName} className={`flex gap-4 ${isYou ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 shadow-sm ${isYou ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {isYou ? <User size={16} /> : <Bot size={16} />}
                            </div>

                            <div className={`flex flex-col max-w-[85%] ${isYou ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-center gap-2 mb-1 px-1">
                                    <span className="text-xs font-bold text-slate-500">
                                        {formatAgentName(agentName)}
                                    </span>
                                    {isYou && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">You</span>}
                                </div>
                                
                                <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed overflow-x-auto ${
                                    isYou 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                                }`}>
                                    {renderLatex(responseStr)}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                    </div>
                </div>
                );
            })
          )}
        </div>

        <div className="p-6 bg-white border-t border-slate-200 flex-shrink-0">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Your Response
          </label>
          <div className="relative">
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Enter your argument here..."
              className="w-full p-4 pr-16 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-32 text-sm text-slate-800 shadow-inner"
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !responseText.trim()}
              className="absolute bottom-4 right-4 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all flex items-center justify-center w-10 h-10 shadow-md"
              title="Submit Response"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HumanInputModal;