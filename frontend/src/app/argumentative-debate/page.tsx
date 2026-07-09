"use client"
import { useRouter, usePathname } from "next/navigation";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  ArrowLeft, 
  Quote, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  Shuffle, 
  Send,
  User,
  Bot,
  PenTool,
  PlusCircle,
  X,
  LayoutGrid,
  FileText,
  MessageSquare,
  Bug,
  Target,
  Gavel
} from 'lucide-react';
import data from '@/utils/data.json';

type StatementSegment = {
  id: string;
  text: string;
  highlighted: boolean;
  storySpan?: [number, number];
};

type JsonDebate = {
  summary: string;
  beforeStory: string;
  story: string;
  afterStory: string;
  question: string;
  debaterClaim: string;
  altClaim: string;
  beforeDebate: string[];
  debaterStatement: StatementSegment[];
  afterDebate: string[];
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

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

const DEBATE_DATA = data as { debates: JsonDebate[] };

const MainSidebar = () => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { icon: <LayoutGrid size={20} />, label: "Dashboard", path: "/" },
    { icon: <Target size={20} />, label: "Analysis Agent", path: "/harness" },
    { icon: <FileText size={20} />, label: "Debate Annotation", path: "/debate-annotation" },
    { icon: <Gavel size={20} />, label: "Argumentative Debate", path: "/argumentative-debate" },
    { icon: <MessageSquare size={20} />, label: "Basic Debate", path: "/debate/new" },
    { icon: <Bug size={20} />, label: "Debug", path: "/debate/debug" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-30 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
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

const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
  <div 
    className="w-4 flex items-center justify-center cursor-col-resize hover:bg-slate-200 transition-colors flex-shrink-0 z-10 group bg-slate-50 border-x border-slate-200"
    onMouseDown={onMouseDown}
  >
    <div className="w-1 h-8 bg-slate-300 rounded-full group-hover:bg-blue-400 transition-colors" />
  </div>
);

export default function DebateGenerator() {
  const router = useRouter();
  
  const [isLoaded, setIsLoaded] = useState(false);
  // Track the current index to avoid picking the same one twice
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  const [story, setStory] = useState("");
  const [summary, setSummary] = useState("");
  const [question, setQuestion] = useState("");
  const [debater1Stance, setDebater1Stance] = useState(""); 
  const [debater2Stance, setDebater2Stance] = useState(""); 
  const [streamingText, setStreamingText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [debaterDraft, setDebaterDraft] = useState(""); 
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
   
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  
  const [paneSplit, setPaneSplit] = useState<number>(75);
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const storyContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      setPaneSplit(Math.min(Math.max(percentage, 20), 80));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (activeCitationId) {
      const activeCitation = citations.find(c => c.id === activeCitationId);
      if (activeCitation) {
        const el = document.getElementById(`citation-source-${activeCitation.sourceId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [activeCitationId, citations]);

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
                id: `cit-ai-${Date.now()}-${i}`,
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
      ai_claim: debateData.debaterClaim,
      human_claim: debateData.altClaim
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
    
    // [UPDATED] Logic to ensure we pick a NEW index if possible
    let randomIndex = Math.floor(Math.random() * DEBATE_DATA.debates.length);
    if (DEBATE_DATA.debates.length > 1 && randomIndex === currentIndex) {
        randomIndex = (randomIndex + 1) % DEBATE_DATA.debates.length;
    }
    
    setCurrentIndex(randomIndex);
    const selectedDebate = DEBATE_DATA.debates[randomIndex];
    
    const fullStoryText = `${selectedDebate.beforeStory}\n\n${selectedDebate.story}\n\n${selectedDebate.afterStory}`;

    // Resetting ALL state relevant to the new round
    setIsGenerating(false); 
    setStreamingText("");
    setStory(fullStoryText);
    setSummary(selectedDebate.summary);
    setQuestion(selectedDebate.question);
    setDebater1Stance(selectedDebate.debaterClaim); 
    setDebater2Stance(selectedDebate.altClaim); 
    setCitations([]);
    setConversationHistory([]);
    setDebaterDraft("");
    setActiveRoundIndex(0);
    setIsLoaded(true);
    
    // Trigger AI generation
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

  const insertCitationIntoDraft = (sourceId: number) => {
    if (!textAreaRef.current) return;
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const insertion = ` [${sourceId}] `;
    const newText = text.substring(0, start) + insertion + text.substring(end);
    setDebaterDraft(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  const addManualCitation = (text: string) => {
    if (!text || text.trim().length === 0) return;
    
    const newId = citations.length > 0 
      ? Math.max(...citations.map(c => c.sourceId)) + 1 
      : 1;
    
    const newCitation: Citation = {
      id: `cit-manual-${Date.now()}`,
      sourceId: newId,
      text: text.trim()
    };
    setCitations(prev => [...prev, newCitation]);
    insertCitationIntoDraft(newId);
  };

  const removeCitation = (idToRemove: string) => {
    setCitations(prev => prev.filter(c => c.id !== idToRemove));
  };

  const handleHumanSubmit = async () => {
    if (!debaterDraft.trim()) return; 
    const currentDraft = debaterDraft;
    
    const updatedHistory: ConversationTurn[] = [
      ...conversationHistory, 
      { speaker: 'human', args: [], draft: currentDraft }
    ];
    setConversationHistory(updatedHistory);
    setIsGenerating(true);
    setStreamingText("");
    setDebaterDraft("");

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
      console.error("Failed to generate response:", error);
      setConversationHistory(prev => [...prev, { speaker: 'ai', args: [{ text: "Error generating response." }] }]);
    } finally {
      setStreamingText("");
      setIsGenerating(false);
    }
  };

  const rounds = useMemo(() => {
    const roundsList = [];
    const totalTurns = conversationHistory.length;
    
    for (let i = 0; i < totalTurns; i += 2) {
      roundsList.push({
        ai: conversationHistory[i],
        human: conversationHistory[i+1] || null
      });
    }

    if (totalTurns % 2 === 0 && isGenerating) {
        roundsList.push({ ai: null, human: null });
    }
    
    return roundsList;
  }, [conversationHistory, isGenerating]);

  useEffect(() => {
    setActiveRoundIndex(Math.max(0, rounds.length - 1));
  }, [rounds.length]);

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
      <div className="text-slate-600 leading-relaxed text-justify whitespace-pre-wrap font-serif">
        {parts.map((part, i) => {
          if (part.highlight) {
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if(part.sourceId) insertCitationIntoDraft(part.sourceId);
                  }}
                >
                  {part.text}
                  <sup className="font-bold text-[10px] ml-0.5 text-slate-500">[{part.sourceId}]</sup>
                </span>
             );
          }
          
          const sentences = part.text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [part.text];
          return (
            <React.Fragment key={i}>
                {sentences.map((sentence, sIdx) => (
                    <span 
                        key={sIdx}
                        onClick={(e) => {
                            e.stopPropagation();
                            addManualCitation(sentence);
                        }}
                        className="hover:bg-yellow-100 cursor-pointer transition-colors rounded px-0.5"
                    >
                        {sentence}
                    </span>
                ))}
            </React.Fragment>
          );
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
            
            let spanClasses = "inline transition-all duration-200 cursor-pointer rounded px-0.5 ";
            
            if (isAi) {
                spanClasses += "underline decoration-2 underline-offset-2 ";
                spanClasses += isActive 
                    ? "bg-blue-100 decoration-blue-500 text-blue-900 font-medium " 
                    : "decoration-blue-300 text-slate-800 hover:bg-blue-50 hover:decoration-blue-500 ";
            } else {
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
                "{citation.text}"
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  if (!isLoaded) return <div className="h-screen flex items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin"/> Loading Case...</div>;

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-800 overflow-hidden">
      
      <MainSidebar />

      <nav className="w-16 bg-white flex-shrink-0 flex flex-col items-center border-r border-slate-200 py-4 gap-4 z-20 shadow-sm">
        <button onClick={() => router.push('/debate/new')} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600">
           <ArrowLeft size={20} />
        </button>
        <div className="w-8 h-[1px] bg-slate-100 my-2" />
        <button onClick={loadRandomCase} className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-slate-400 border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm" title="New Case">
           <Shuffle size={18} />
        </button>
      </nav>

      <div ref={containerRef} className="flex-1 flex min-h-0 bg-white">
        
        <div style={{ width: `${paneSplit}%` }} className="flex flex-col min-w-[400px] bg-slate-50/50">
            
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Debate Generator</span>
                        <h2 className="text-lg font-bold text-slate-800 leading-tight">{question}</h2>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto w-full">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block mb-1">Debater 1 (AI)</span>
                        <p className="text-sm font-medium text-slate-800 leading-snug">{debater1Stance}</p>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block mb-1">Debater 2 (You)</span>
                        <p className="text-sm font-medium text-slate-800 leading-snug">{debater2Stance}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-lg border border-slate-200 w-full max-w-xs mx-auto">
                    <button 
                        onClick={() => setActiveRoundIndex(Math.max(0, activeRoundIndex - 1))}
                        disabled={activeRoundIndex === 0}
                        className="p-2 hover:bg-white rounded-md disabled:opacity-30 transition-all shadow-sm text-slate-600"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-mono font-medium text-slate-500">
                        ROUND {activeRoundIndex + 1} / {Math.max(1, rounds.length)}
                    </span>
                    <button 
                        onClick={() => setActiveRoundIndex(Math.min(rounds.length - 1, activeRoundIndex + 1))}
                        disabled={activeRoundIndex >= rounds.length - 1}
                        className="p-2 hover:bg-white rounded-md disabled:opacity-30 transition-all shadow-sm text-slate-600"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-slate-300">
                <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto h-full content-start">
                    
                    <div className="flex flex-col h-full">
                        <div className="flex-1">
                            {rounds[activeRoundIndex]?.ai ? (
                                <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl rounded-tl-none shadow-sm h-full relative group">
                                    <div className="absolute -top-3 -left-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-blue-500">
                                        <Bot size={14} />
                                    </div>
                                    <div className="space-y-4">
                                        {rounds[activeRoundIndex].ai.args.map((arg, i) => (
                                            <p key={i} className="text-sm text-slate-700 leading-relaxed">
                                                {renderMessageContent(arg.text, 'ai')}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ) : isGenerating && !rounds[activeRoundIndex]?.human ? (
                                <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl rounded-tl-none shadow-sm h-full relative group animate-pulse">
                                    <div className="absolute -top-3 -left-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-blue-500">
                                        <Loader2 size={14} className="animate-spin" />
                                    </div>
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                        {renderMessageContent(streamingText, 'ai')}
                                    </p>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-300 text-sm italic">Waiting...</div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col h-full">
                        <div className="flex-1">
                            {rounds[activeRoundIndex]?.human ? (
                                <div className="bg-rose-50 border border-rose-100 p-5 rounded-xl rounded-tr-none shadow-sm h-full relative group">
                                    <div className="absolute -top-3 -right-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-rose-500">
                                        <User size={14} />
                                    </div>
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                        {renderMessageContent(rounds[activeRoundIndex].human.draft || "", 'human')}
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-white border border-rose-200 p-1 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-rose-100 transition-all flex flex-col h-full min-h-[300px]">
                                    <div className="absolute -top-3 -right-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-rose-500 z-10">
                                        <PenTool size={14} />
                                    </div>
                                    <textarea 
                                        ref={textAreaRef}
                                        value={debaterDraft}
                                        onChange={(e) => setDebaterDraft(e.target.value)}
                                        placeholder="Draft your argument here..."
                                        className="w-full flex-1 p-4 text-sm text-slate-700 leading-relaxed resize-none focus:outline-none rounded-t-xl"
                                    />
                                    <div className="p-2 flex justify-between items-center bg-rose-50/50 rounded-b-xl border-t border-rose-100">
                                        <span className="text-[10px] text-rose-400 font-medium pl-2">
                                            Highlight story text to cite
                                        </span>
                                        <button 
                                            onClick={handleHumanSubmit}
                                            disabled={!debaterDraft.trim() || isGenerating}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                                                !debaterDraft.trim() || isGenerating 
                                                ? 'bg-slate-200 text-slate-400' 
                                                : 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
                                            }`}
                                        >
                                            <Send size={12} /> Submit
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-48 border-t border-slate-200 bg-white flex flex-col shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] z-10">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                    <Quote size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase">Evidence Bank</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {citations.length === 0 ? (
                        <div className="text-center p-8 flex flex-col items-center justify-center opacity-50">
                            <PlusCircle size={20} className="text-slate-400 mb-2"/>
                            <p className="text-slate-500 text-xs">Highlight text in the story to add evidence.</p>
                        </div>
                    ) : (
                        citations.map((citation) => {
                            const isAiSource = citation.id.startsWith('cit-ai');
                            const activeClass = isAiSource 
                                ? 'bg-blue-50 border-blue-200 text-slate-800 shadow-md transform scale-[1.01]' 
                                : 'bg-rose-50 border-rose-200 text-slate-800 shadow-md transform scale-[1.01]';
                            
                            return (
                                <div 
                                    key={citation.id}
                                    id={`citation-card-${citation.id}`}
                                    onClick={() => insertCitationIntoDraft(citation.sourceId)}
                                    onMouseEnter={() => setActiveCitationId(citation.id)}
                                    onMouseLeave={() => setActiveCitationId(null)}
                                    className={`
                                        p-3 rounded-lg border text-sm cursor-pointer transition-all duration-200 group relative
                                        ${activeCitationId === citation.id ? activeClass : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}
                                    `}
                                >
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeCitation(citation.id); }}
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <X size={12} />
                                    </button>
                                    <div className="flex items-start gap-3">
                                        <span className={`
                                            flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold mt-0.5 transition-colors
                                            ${activeCitationId === citation.id 
                                                ? (isAiSource ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white') 
                                                : 'bg-slate-100 text-slate-500'}
                                        `}>
                                            {citation.sourceId}
                                        </span>
                                        <p className="leading-snug italic font-medium text-xs line-clamp-2 pr-4">"{citation.text}"</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>

        <ResizeHandle onMouseDown={() => { isDragging.current = true; document.body.style.cursor = 'col-resize'; }} />

        <div style={{ width: `${100 - paneSplit}%` }} className="flex flex-col min-w-[300px] bg-white border-l border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur z-10">
                <BookOpen size={16} className="text-slate-500" />
                <h3 className="text-xs font-bold text-slate-500 uppercase">Context Story</h3>
            </div>
            
            <div ref={storyContainerRef} className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="prose prose-sm prose-slate max-w-none font-serif leading-loose text-slate-700">
                    <div className="p-4 bg-slate-50 rounded-xl mb-6 text-sm text-slate-600 border border-slate-100 shadow-sm">
                        <span className="font-bold text-slate-400 uppercase text-[10px] tracking-widest block mb-2">Summary</span>
                        {summary}
                    </div>
                    {renderHighlightedStory()}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}