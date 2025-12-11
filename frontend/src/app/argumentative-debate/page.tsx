"use client"
import { useRouter } from "next/navigation";
import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, 
  Scroll, 
  ArrowLeft, 
  Quote, 
  Bot, 
  PenTool, 
  PlusCircle, 
  Loader2, 
  X, 
  Shuffle, 
  Send 
} from 'lucide-react';
import data from '@/utils/data.json';

type JsonCitation = {
  text: string;
  span: number[];
};

type JsonDebater = {
  claim: string;
  arguments: string[]; 
};

type JsonDebate = {
  story: string;
  question: string;
  debater1: JsonDebater;
  debater2: JsonDebater;
  judge: any;
  citations: JsonCitation[];
};

type Citation = {
  id: string;
  sourceId: number;
  text: string;
  index?: number;
};

type GeneratedArg = {
  text: string;
};

type ConversationTurn = {
  speaker: 'ai' | 'human';
  args: GeneratedArg[];
  draft?: string;
};

const DEBATE_DATA = data as { debates: JsonDebate[] };

export default function DebateGenerator() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [story, setStory] = useState("");
  const [question, setQuestion] = useState("");
  const [debater1Stance, setDebater1Stance] = useState("");
  const [debater2Stance, setDebater2Stance] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [debater2Draft, setDebater2Draft] = useState(""); 
   
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const storyContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  const fetchAIResponseStream = async (
    payload: any,
    onToken: (text: string) => void,
    onCitations: (citations: any[]) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ) => {
    try {
      const response = await fetch(`/api/argumentative-debate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'token') onToken(parsed.content);
              else if (parsed.type === 'citations') onCitations(parsed.citations);
              else if (parsed.type === 'error') { onError(parsed.message); return; }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
      onError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const fetchAIResponse = async (
    payload: any,
    onUpdate: (currentText: string) => void
  ): Promise<GeneratedArg[]> => {
    return new Promise((resolve, reject) => {
      let fullText = '';
      fetchAIResponseStream(
        payload,
        (text) => { fullText += text; onUpdate(fullText); },
        (newCitations) => {
          if (newCitations && newCitations.length > 0) {
            setCitations(prev => {
              const formatted = newCitations.map((c: any, i: number) => ({
                id: `cit-ai-${Date.now()}-${i}`, // Starts with cit-ai
                sourceId: c.sourceId,
                text: c.text,
                index: c.index 
              }));
              
              const existingIds = new Set(prev.map(p => p.sourceId));
              const uniqueNew = formatted.filter(f => !existingIds.has(f.sourceId));
              
              return [...prev, ...uniqueNew];
            });
          }
        },
        () => {
          if (fullText.trim()) resolve([{ text: fullText }]);
          else reject(new Error('No content received'));
        },
        (error) => reject(new Error(error))
      );
    });
  };

  const generateOpeningArgument = async (debateData: JsonDebate) => {
    setIsGenerating(true);
    setStreamingText("");
    
    const payload = {
      type: 'opening',
      story: debateData.story,
      question: debateData.question,
      ai_claim: debateData.debater1.claim,
      human_claim: debateData.debater2.claim
    };
    
    try {
      const newArgs = await fetchAIResponse(
        payload,
        (currentText) => setStreamingText(currentText)
      );
      setConversationHistory([{ speaker: 'ai', args: newArgs }]);
    } catch (error) {
      console.error("Failed to generate opening:", error);
      setConversationHistory([{ speaker: 'ai', args: [{ text: "Error generating argument." }] }]);
    } finally {
      setStreamingText("");
      setIsGenerating(false);
    }
  };

  const loadRandomCase = () => {
    if (!DEBATE_DATA.debates || DEBATE_DATA.debates.length === 0) return;
    const randomIndex = Math.floor(Math.random() * DEBATE_DATA.debates.length);
    const selectedDebate = DEBATE_DATA.debates[randomIndex];
    
    setStory(selectedDebate.story);
    setQuestion(selectedDebate.question);
    setDebater1Stance(selectedDebate.debater1.claim);
    setDebater2Stance(selectedDebate.debater2.claim);     
    setCitations([]);
    setConversationHistory([]);
    setDebater2Draft("");
    setIsLoaded(true);
    generateOpeningArgument(selectedDebate);
  };

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      loadRandomCase();
    }
  }, []);
  
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

 const renderHighlightedStory = () => {
    if (!story) return null;
    
    const sortedCitations = [...citations].sort((a, b) => b.text.length - a.text.length);
    let parts = [{ text: story, highlight: false, id: null as string | null, sourceId: 0 }];

    sortedCitations.forEach(citation => {
      const newParts: any[] = [];
      parts.forEach(part => {
        if (part.highlight) {
          newParts.push(part);
          return;
        }

        const regex = new RegExp(`(${escapeRegExp(citation.text)})`, 'i');
        const split = part.text.split(regex);

        if (split.length > 1) {
          split.forEach(segment => {
            if (segment.toLowerCase() === citation.text.toLowerCase()) {
              newParts.push({ text: segment, highlight: true, id: citation.id, sourceId: citation.sourceId });
            } else if (segment) {
              newParts.push({ text: segment, highlight: false, id: null, sourceId: 0 });
            }
          });
        } else {
          newParts.push(part);
        }
      });
      parts = newParts;
    });

    return (
      <div className="text-slate-600 leading-relaxed text-justify whitespace-pre-wrap">
        {parts.map((part, i) => {
          if (part.highlight) {
             // Determine color based on ID prefix
             const isAiSource = part.id?.startsWith('cit-ai');
             const activeClass = isAiSource 
                ? 'bg-blue-200 text-blue-900 ring-2 ring-blue-300' 
                : 'bg-rose-200 text-rose-900 ring-2 ring-rose-300';
             
             return (
                <span 
                  key={i}
                  id={`citation-source-${part.sourceId}`}
                  className={`
                    cursor-pointer rounded px-0.5 transition-colors duration-200
                    ${activeCitationId === part.id ? activeClass : 'bg-yellow-100 hover:bg-yellow-200'}
                  `}
                  onMouseEnter={() => setActiveCitationId(part.id)}
                  onMouseLeave={() => setActiveCitationId(null)}
                  // FIX 1: Add onMouseUp here so you can select parts of this quote
                  onMouseUp={handleStoryTextSelect}
                  onClick={(e) => {
                    // FIX 2: Prevent adding the whole citation if the user is actually selecting text
                    const selection = window.getSelection();
                    if (selection && selection.toString().length > 0) {
                        return; // User is selecting, don't trigger the click
                    }
                    if(part.sourceId) insertCitationIntoDraft(part.sourceId);
                  }}
                >
                  {part.text}
                  <sup className="font-bold text-[10px] ml-0.5 text-slate-500">[{part.sourceId}]</sup>
                </span>
             );
          }
          return <span key={i} onMouseUp={handleStoryTextSelect}>{part.text}</span>;
        })}
      </div>
    );
  };

  const renderMessageContent = (text: string, speaker: 'ai' | 'human') => {
    const parts = text.split(/(\[\d+\])/g);
    
    return (
      <>
        {parts.map((part, i) => {
          if (part.match(/^\[\d+\]$/)) {
            const id = parseInt(part.replace(/[\[\]]/g, ''));
            const citation = citations.find(c => c.sourceId === id);
            
            if (!citation) return <span key={i} className="text-gray-400 text-xs">{part}</span>;

            const isAi = speaker === 'ai';
            const isActive = activeCitationId === citation.id;
            // Note: In the chat bubble, we style based on the Speaker (AI vs Human) for readability,
            // but the hover effect on the sidebar will respect the source type.
            
            let spanClasses = "inline transition-all duration-200 cursor-pointer rounded px-0.5 ";
            
            if (isAi) {
                // AI Speaker Styling
                spanClasses += "underline decoration-2 underline-offset-2 ";
                spanClasses += isActive 
                    ? "bg-blue-100 decoration-blue-500 text-blue-900 font-medium " 
                    : "decoration-blue-300 text-slate-800 hover:bg-blue-50 hover:decoration-blue-500 ";
            } else {
                // Human Speaker Styling
                spanClasses += "underline decoration-2 underline-offset-2 ";
                spanClasses += isActive
                    ? "bg-rose-100 decoration-rose-500 text-rose-900 font-medium "
                    : "decoration-rose-300 text-slate-800 hover:bg-rose-50 hover:decoration-rose-500 ";
            }

            return (
              <span
                key={i}
                className={spanClasses}
                onMouseEnter={() => setActiveCitationId(citation.id)}
                onMouseLeave={() => setActiveCitationId(null)}
                onClick={() => {
                  const el = document.getElementById(`citation-card-${citation.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  
                  const textEl = document.getElementById(`citation-source-${citation.sourceId}`);
                  if (textEl) textEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {/* Truncation removed as requested */}
                "{citation.text}"
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  const handleStoryTextSelect = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (text.length > 10) {
      const newId = citations.length > 0 
        ? Math.max(...citations.map(c => c.sourceId)) + 1 
        : 1;
      
      const newCitation: Citation = {
        id: `cit-manual-${Date.now()}`, // Starts with cit-manual
        sourceId: newId,
        text: text
      };
      setCitations([...citations, newCitation]);
      selection.removeAllRanges();
    }
  };

  const removeCitation = (idToRemove: string) => {
    setCitations(prev => prev.filter(c => c.id !== idToRemove));
  };

  const handleHumanSubmit = async () => {
    if (!debater2Draft.trim()) return; 
    const currentDraft = debater2Draft;
    const updatedHistory: ConversationTurn[] = [
      ...conversationHistory, 
      { speaker: 'human', args: [], draft: currentDraft }
    ];
    setConversationHistory(updatedHistory);
    setIsGenerating(true);
    setStreamingText("");
    setDebater2Draft("");

    const payload = {
      type: 'rebuttal',
      story: story,
      question: question,
      ai_claim: debater1Stance,
      human_claim: debater2Stance,
      history: updatedHistory,
      human_latest_argument: currentDraft
    };

    try {
      const newArgs = await fetchAIResponse(
        payload,
        (currentText) => setStreamingText(currentText)
      );
      setConversationHistory(prev => [...prev, { speaker: 'ai', args: newArgs }]);
    } catch (error) {
      console.error("Failed to generate rebuttal:", error);
      setConversationHistory(prev => [...prev, { speaker: 'ai', args: [{ text: "Error generating rebuttal." }] }]);
    } finally {
      setStreamingText("");
      setIsGenerating(false);
    }
  };

  const insertCitationIntoDraft = (sourceId: number) => {
    if (!textAreaRef.current) return;
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const insertion = ` [${sourceId}] `;
    const newText = text.substring(0, start) + insertion + text.substring(end);
    setDebater2Draft(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  if (!isLoaded) return <div className="h-screen flex items-center justify-center gap-2"><Loader2 className="animate-spin"/> Loading Case...</div>;

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-800 overflow-hidden relative">
      <nav className="w-20 bg-white flex-shrink-0 flex flex-col items-center border-r border-slate-200 py-4 gap-4 z-20">
        <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-md cursor-pointer" onClick={() => router.push('/dashboard')}>
           <ArrowLeft size={20} />
        </button>
        <div className="w-8 h-[1px] bg-slate-100" />
        <button onClick={loadRandomCase} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-slate-400 border border-slate-200 hover:bg-slate-50 hover:text-blue-600 transition-all cursor-pointer" title="Load Random Story">
           <Shuffle size={20} />
        </button>
      </nav>

      <div className="flex-1 flex flex-col min-h-0 bg-white">
        <div className="flex-1 grid grid-cols-12 min-h-0 divide-x divide-slate-200">
          
          <aside className="col-span-12 md:col-span-3 flex flex-col bg-slate-50/50 min-h-0">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-slate-50/95 backdrop-blur z-10">
              <div className="flex items-center gap-2">
                <Scroll size={14} className="text-slate-500"/>
                <h3 className="text-xs font-bold text-slate-500 uppercase">Context Story</h3>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                Select to Cite
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200" ref={storyContainerRef}>
              {renderHighlightedStory()}
            </div>
          </aside>

          <main className="col-span-12 md:col-span-6 flex flex-col bg-white min-h-0">
            <div className="p-6 border-b border-slate-100 bg-white z-10">
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Debate Question</span>
                  <div className="w-full text-lg font-semibold text-slate-800 leading-snug">{question}</div>
                </div>
                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 block">Debater 1 (AI)</span>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed">{debater1Stance}</div>
                  </div>
                  <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100/50">
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1 block">Debater 2 (Human)</span>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed">{debater2Stance}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
              {conversationHistory.map((turn, index) => (
                <div key={index}>
                  {turn.speaker === 'ai' ? (
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0 mt-2">
                        <Bot size={16} />
                      </div>
                      <div className="flex-1 max-w-3xl">
                        <div className="bg-white border border-blue-100 p-6 rounded-2xl rounded-tl-none shadow-sm">
                          <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wide mb-4">
                            {index === 0 ? "AI Opening Argument" : "AI Rebuttal"}
                          </h4>
                          <div className="space-y-4">
                            {turn.args.map((arg, i) => (
                              <p key={i} className="text-sm text-slate-600 leading-7 bg-blue-50/30 p-3 rounded-lg border border-blue-100/50">
                                {renderMessageContent(arg.text, 'ai')}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4 flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0 mt-2">
                        <PenTool size={14} />
                      </div>
                      <div className="flex-1 max-w-3xl">
                        <div className="bg-white border border-rose-100 p-6 rounded-2xl rounded-tr-none shadow-sm">
                          <h4 className="font-bold text-rose-400 text-xs uppercase tracking-wide mb-4">Your Argument</h4>
                          <p className="text-sm text-slate-700 leading-7 bg-rose-50/30 p-3 rounded-lg border border-rose-100/50">
                            {turn.draft && renderMessageContent(turn.draft, 'human')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isGenerating && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-white shadow-sm mt-2">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                  <div className="flex-1 max-w-3xl">
                    <div className="bg-white border border-blue-100 p-6 rounded-2xl rounded-tl-none shadow-sm">
                      <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wide mb-4">AI is Thinking...</h4>
                      <p className="text-sm text-slate-600 leading-7 bg-blue-50/30 p-3 rounded-lg border border-blue-100/50">
                        {renderMessageContent(streamingText, 'ai')} <span className="inline-block w-1 h-4 bg-blue-600 ml-1 animate-pulse"></span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
               <div className="bg-white border border-rose-100 p-1 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-rose-100 transition-all">
                  <div className="bg-rose-50/50 px-4 py-2 rounded-t-xl border-b border-rose-100 flex justify-between items-center">
                     <h4 className="font-bold text-rose-400 text-xs uppercase tracking-wide">Your Argument</h4>
                     <span className="text-[10px] text-rose-400/70">Highlight text on left to cite</span>
                  </div>
                  <textarea 
                    ref={textAreaRef}
                    value={debater2Draft}
                    onChange={(e) => setDebater2Draft(e.target.value)}
                    placeholder={`Argue for: "${debater2Stance}"...`}
                    className="w-full min-h-[120px] p-4 text-sm text-slate-700 leading-7 resize-none focus:outline-none"
                  />
                  <div className="p-2 flex justify-end bg-white rounded-b-xl">
                    <button 
                      onClick={handleHumanSubmit}
                      disabled={!debater2Draft.trim() || isGenerating}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                        !debater2Draft.trim() || isGenerating ? 'bg-slate-100 text-slate-400' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-md'
                      }`}
                    >
                      <Send size={14} /> Submit & Rebut
                    </button>
                  </div>
               </div>
            </div>
          </main>

          <aside className="col-span-12 md:col-span-3 flex flex-col bg-slate-50/50 min-h-0">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-slate-50/95 backdrop-blur z-10">
              <BookOpen size={14} className="text-slate-500"/>
              <h3 className="text-xs font-bold text-slate-500 uppercase">Evidence Bank</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
              {citations.length === 0 ? (
                <div className="text-center p-10 flex flex-col items-center justify-center opacity-50">
                  <PlusCircle size={24} className="text-slate-400 mb-2"/>
                  <p className="text-slate-500 text-xs">Highlight story text<br/>to create citations.</p>
                </div>
              ) : (
                citations.map((citation) => {
                  const isAiSource = citation.id.startsWith('cit-ai');
                  const activeClass = isAiSource 
                    ? 'bg-blue-50 border-blue-200 text-slate-800 shadow-md transform scale-[1.02] z-10' 
                    : 'bg-rose-50 border-rose-200 text-slate-800 shadow-md transform scale-[1.02] z-10';
                  const defaultClass = 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm';

                  return (
                    <div 
                      key={citation.id}
                      id={`citation-card-${citation.id}`}
                      onClick={() => insertCitationIntoDraft(citation.sourceId)}
                      onMouseEnter={() => setActiveCitationId(citation.id)}
                      onMouseLeave={() => setActiveCitationId(null)}
                      className={`
                        p-4 rounded-xl border text-sm cursor-pointer transition-all duration-200 group relative pr-8
                        ${activeCitationId === citation.id ? activeClass : defaultClass}
                      `}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); removeCitation(citation.id); }}
                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                      <div className="flex items-start gap-3">
                        <span className={`
                          flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold mt-0.5 transition-colors
                          ${activeCitationId === citation.id 
                             ? (isAiSource ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white')
                             : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                          }
                        `}>
                          {citation.sourceId}
                        </span>
                        <div className="space-y-1">
                          <div className="flex items-start gap-2">
                            <Quote size={12} className="flex-shrink-0 mt-1 text-slate-300" />
                            <p className="leading-snug italic font-medium line-clamp-3">"{citation.text}"</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}