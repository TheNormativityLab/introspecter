"use client"
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, 
  ArrowLeft, 
  Quote, 
  ChevronLeft, 
  ChevronRight, 
  Gavel, 
  User,
  Scale,
  Highlighter,
  Check
} from 'lucide-react';
import data from '@/utils/data.json';

type StatementSegment = {
  id: string;
  text: string;
  highlighted: boolean;
  storySpan?: [number, number];
};

type DebateCase = {
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
  judge?: {
    comment: string;
  };
};

const DEBATE_COLLECTION = (data as { debates: DebateCase[] }).debates;

const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
  <div 
    className="w-4 flex items-center justify-center cursor-col-resize hover:bg-slate-200 transition-colors flex-shrink-0 z-10 group bg-slate-50 border-x border-slate-200"
    onMouseDown={onMouseDown}
  >
    <div className="w-1 h-8 bg-slate-300 rounded-full group-hover:bg-blue-400 transition-colors" />
  </div>
);

export default function DebateDashboard() {
  const router = useRouter(); 
  
  const [caseIndex, setCaseIndex] = useState<number>(0);
  const [roundIndex, setRoundIndex] = useState<number>(0); 
  const [paneSplit, setPaneSplit] = useState<number>(75); 
  
  const [activeHighlight, setActiveHighlight] = useState<{ span: [number, number], source: 'debater' | 'opponent' } | null>(null);
  
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [globalViolations, setGlobalViolations] = useState<Record<number, Set<string>>>({});

  const storyContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
    if (activeHighlight && storyContainerRef.current) {
      const el = storyContainerRef.current.querySelector('#active-story-highlight');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeHighlight]);

  const currentCase = DEBATE_COLLECTION[caseIndex];
  const currentViolations = globalViolations[caseIndex] || new Set();
  
  const fullStory = useMemo(() => {
    if (!currentCase) return '';
    return `${currentCase.beforeStory}\n\n${currentCase.story}\n\n${currentCase.afterStory}`;
  }, [currentCase]);

  const rounds = useMemo(() => {
    if (!currentCase) return [];

    type Round = {
      id: number;
      debater: StatementSegment[] | string | null;
      opponent: string | null;
      judge: string | null;
    };

    const parsedRounds: Round[] = [];
    let currentRound: Round = { id: 0, debater: null, opponent: null, judge: null };

    const pushRound = () => {
        parsedRounds.push({ ...currentRound, id: parsedRounds.length });
        currentRound = { id: parsedRounds.length, debater: null, opponent: null, judge: null };
    };

    currentCase.beforeDebate.forEach(t => {
      const match = t.match(/^(Debater|Opponent|Judge):\s*(.*)/i);
      if (match) {
        const [_, role, text] = match;
        if (role === 'Debater') {
            if (currentRound.debater) pushRound();
            currentRound.debater = text;
        } else if (role === 'Opponent') {
            if (currentRound.opponent) pushRound();
            currentRound.opponent = text;
        } else if (role === 'Judge') {
            currentRound.judge = text;
        }
      }
    });

    if (currentRound.debater) pushRound();
    currentRound.debater = currentCase.debaterStatement;

    currentCase.afterDebate.forEach(t => {
      const match = t.match(/^(Debater|Opponent|Judge):\s*(.*)/i);
      if (match) {
        const [_, role, text] = match;
        if (role === 'Debater') {
            if (currentRound.debater) pushRound();
            currentRound.debater = text;
        } else if (role === 'Opponent') {
            if (currentRound.opponent) pushRound();
            currentRound.opponent = text;
        } else if (role === 'Judge') {
            currentRound.judge = text;
        }
      }
    });
    
    pushRound(); 
    return parsedRounds.filter(r => r.debater || r.opponent || r.judge);
  }, [currentCase]);

  useEffect(() => {
    setRoundIndex(0);
  }, [caseIndex]);

  const currentRound = rounds[roundIndex] || { debater: null, opponent: null, judge: null };

  const handleViolationToggle = (id: string) => {
    const newSet = new Set(currentViolations);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    
    setGlobalViolations({
        ...globalViolations,
        [caseIndex]: newSet
    });
  };

  const renderInteractiveText = (text: string, side: 'debater' | 'opponent') => {
    const sentences = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text];

    return (
      <p className="text-sm leading-relaxed text-slate-700">
        {sentences.map((sentence, idx) => {
          const violationId = `${roundIndex}-${side}-${idx}`;
          const isViolated = currentViolations.has(violationId);

          return (
            <span
              key={idx}
              onClick={(e) => {
                if (!isAnnotating) return;
                e.stopPropagation();
                handleViolationToggle(violationId);
              }}
              className={`
                rounded px-0.5 transition-colors duration-200
                ${isAnnotating ? 'cursor-pointer hover:bg-slate-200' : ''}
                ${isViolated ? 'bg-red-100 text-red-900 decoration-red-500 underline decoration-2 underline-offset-2' : ''}
              `}
            >
              {sentence}
            </span>
          );
        })}
      </p>
    );
  };

  const renderInteractiveSegments = (segments: StatementSegment[]) => {
    return (
      <p className="text-sm leading-relaxed text-slate-700">
        {segments.map((seg, i) => {
          const violationId = `${roundIndex}-debater-seg-${i}`;
          const isViolated = currentViolations.has(violationId);
          const isActive = activeHighlight && seg.storySpan && activeHighlight.span[0] === seg.storySpan[0];

          return (
            <span 
              key={seg.id || i}
              onMouseEnter={() => !isAnnotating && seg.storySpan && setActiveHighlight({ span: seg.storySpan, source: 'debater' })}
              onMouseLeave={() => !isAnnotating && setActiveHighlight(null)}
              onClick={(e) => {
                 if (!isAnnotating) return;
                 handleViolationToggle(violationId);
              }}
              className={`
                transition-all duration-200 rounded px-0.5
                ${isActive && !isAnnotating ? 'bg-blue-200 decoration-blue-500 underline text-blue-900' : ''}
                ${seg.highlighted && !isViolated && !isAnnotating && !isActive ? 'bg-blue-50 decoration-blue-300 underline decoration-2 underline-offset-2 cursor-pointer hover:bg-blue-100' : ''}
                
                ${isAnnotating ? 'cursor-pointer hover:bg-slate-200' : ''}
                ${isViolated ? 'bg-red-100 text-red-900 decoration-red-500 underline decoration-2 underline-offset-2' : ''}
              `}
            >
              {seg.text}
            </span>
          );
        })}
      </p>
    );
  };

  const renderDebaterContent = (content: StatementSegment[] | string | null) => {
    if (!content) return <div className="text-slate-400 italic text-sm p-4">Waiting for response...</div>;
    
    return (
        <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl rounded-tl-none shadow-sm h-full relative group">
            <div className="absolute -top-3 -left-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-blue-500">
                <div className="w-3.5 h-3.5"><User size={14} /></div>
            </div>
            {Array.isArray(content) 
                ? renderInteractiveSegments(content) 
                : renderInteractiveText(content.replace(/^Debater:\s*/i, ''), 'debater')
            }
        </div>
    );
  };

  const renderOpponentContent = (content: string | null) => {
    if (!content) return <div className="text-slate-400 italic text-sm p-4 text-right">Waiting for response...</div>;
    return (
        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl rounded-tr-none shadow-sm h-full relative group">
            <div className="absolute -top-3 -right-2 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-indigo-500">
                <div className="w-3.5 h-3.5"><User size={14} /></div>
            </div>
            {renderInteractiveText(content.replace(/^Opponent:\s*/i, ''), 'opponent')}
        </div>
    );
  };

  const renderStoryWithHighlights = () => {
    if (!activeHighlight) return <div className="whitespace-pre-wrap">{fullStory}</div>;

    const offset = currentCase.beforeStory.length + 2; 
    const [start, end] = activeHighlight.span;
    const adjustedStart = start + offset;
    const adjustedEnd = end + offset;

    const before = fullStory.slice(0, adjustedStart);
    const match = fullStory.slice(adjustedStart, adjustedEnd);
    const after = fullStory.slice(adjustedEnd);

    const highlightClass = activeHighlight.source === 'debater' 
        ? 'bg-blue-200 text-blue-900 border-b-2 border-blue-500' 
        : 'bg-rose-200 text-rose-900 border-b-2 border-rose-500';

    return (
        <div className="whitespace-pre-wrap">
            {before}
            <span 
              id="active-story-highlight" 
              className={`${highlightClass} font-medium px-0.5 rounded-sm transition-all duration-200`}
            >
              {match}
            </span>
            {after}
        </div>
    );
  };

  if (!currentCase) return <div className="p-10 text-slate-500">Loading Data...</div>;

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-800 overflow-hidden">
      
      <nav className="w-16 bg-white flex-shrink-0 flex flex-col items-center border-r border-slate-200 py-4 gap-4 z-20 shadow-sm">
        <button onClick={() => router.push('/')} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600">
           <ArrowLeft size={20} />
        </button>
        <div className="w-8 h-[1px] bg-slate-100 my-2" />
        <div className="flex-1 flex flex-col gap-2 w-full px-2 overflow-y-auto scrollbar-none">
            {DEBATE_COLLECTION.map((_, i) => (
                <button
                    key={i}
                    onClick={() => setCaseIndex(i)}
                    className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 border
                        ${caseIndex === i 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                            : 'bg-white text-slate-400 border-transparent hover:border-slate-200 hover:bg-slate-50'
                        }
                    `}
                >
                    {i + 1}
                </button>
            ))}
        </div>
      </nav>

      <div ref={containerRef} className="flex-1 flex min-h-0 bg-white">
        
        <div style={{ width: `${paneSplit}%` }} className="flex flex-col min-w-[400px] bg-slate-50/50">
            
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Case #{caseIndex + 1}</span>
                        <h2 className="text-lg font-bold text-slate-800 leading-tight">{currentCase.question}</h2>
                    </div>
                    
                    <button 
                        onClick={() => setIsAnnotating(!isAnnotating)}
                        className={`
                            flex items-center gap-3 px-5 py-2.5 rounded-lg font-bold transition-all shadow-sm border
                            ${isAnnotating 
                                ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-200 transform scale-105' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }
                        `}
                    >
                        {isAnnotating ? <Check size={18} className="text-green-400"/> : <Highlighter size={18} />}
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-sm">Annotator Tool</span>
                            <span className={`text-[10px] uppercase tracking-wide mt-0.5 ${isAnnotating ? 'text-slate-400' : 'text-slate-400'}`}>
                                {isAnnotating ? 'Active: Click sentences' : 'Inactive'}
                            </span>
                        </div>
                    </button>
                </div>

                {/* --- ADDED: Claims are now here in the sticky header --- */}
                <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto w-full">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">Debater</span>
                        <p className="text-sm font-medium text-slate-800 leading-snug">{currentCase.debaterClaim}</p>
                    </div>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">Opponent</span>
                        <p className="text-sm font-medium text-slate-800 leading-snug">{currentCase.altClaim}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-lg border border-slate-200 w-full max-w-xs mx-auto">
                    <button 
                        onClick={() => setRoundIndex(Math.max(0, roundIndex - 1))}
                        disabled={roundIndex === 0}
                        className="p-2 hover:bg-white rounded-md disabled:opacity-30 transition-all shadow-sm text-slate-600"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-mono font-medium text-slate-500">
                        ROUND {roundIndex + 1} / {rounds.length}
                    </span>
                    <button 
                        onClick={() => setRoundIndex(Math.min(rounds.length - 1, roundIndex + 1))}
                        disabled={roundIndex >= rounds.length - 1}
                        className="p-2 hover:bg-white rounded-md disabled:opacity-30 transition-all shadow-sm text-slate-600"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300">
                <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto pb-12 content-start">
                    
                    <div className="flex flex-col h-full">
                        {/* --- REMOVED: Claims from here --- */}
                        <div className="flex-1">
                            {renderDebaterContent(currentRound.debater)}
                        </div>
                    </div>

                    <div className="flex flex-col h-full">
                        {/* --- REMOVED: Claims from here --- */}
                        <div className="flex-1">
                            {renderOpponentContent(currentRound.opponent)}
                        </div>
                    </div>

                    {currentRound.judge && (
                        <div className="col-span-2 mt-8">
                            <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 text-stone-500 pb-2 border-b border-stone-100">
                                    <Scale size={16} />
                                    <span className="text-xs font-bold uppercase tracking-widest">Judge's Commentary</span>
                                </div>
                                <p className="text-sm text-stone-700 leading-relaxed">
                                    {currentRound.judge.replace(/^Judge:\s*/i, '')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="h-48 border-t border-slate-200 bg-white flex flex-col shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] z-10">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                    <Quote size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase">Evidence Bank</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {currentCase.debaterStatement
                        .filter(s => s.highlighted)
                        .map((seg, i) => (
                            <div 
                                key={i}
                                onMouseEnter={() => !isAnnotating && seg.storySpan && setActiveHighlight({ span: seg.storySpan, source: 'debater' })}
                                onMouseLeave={() => !isAnnotating && setActiveHighlight(null)}
                                className={`
                                    flex gap-3 p-3 rounded-lg border cursor-pointer transition-all group
                                    ${activeHighlight && seg.storySpan && activeHighlight.span[0] === seg.storySpan[0] && activeHighlight.source === 'debater'
                                        ? 'border-blue-400 bg-blue-50 shadow-sm' 
                                        : 'border-slate-100 hover:border-blue-300 hover:bg-blue-50'
                                    }
                                `}
                            >
                                <div className={`
                                    mt-1 min-w-[16px] h-4 rounded text-[9px] flex items-center justify-center font-bold transition-colors
                                    ${activeHighlight && seg.storySpan && activeHighlight.span[0] === seg.storySpan[0] 
                                        ? 'bg-blue-400 text-white' 
                                        : 'bg-slate-200 text-slate-600 group-hover:bg-blue-200 group-hover:text-blue-800'
                                    }
                                `}>
                                    {i + 1}
                                </div>
                                <p className="text-sm text-slate-700 leading-snug">
                                    "{seg.text}"
                                </p>
                            </div>
                        ))
                    }
                    {currentCase.debaterStatement.filter(s => s.highlighted).length === 0 && (
                        <div className="text-center p-4 text-xs text-slate-400 italic">No highlighted evidence.</div>
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
                        {currentCase.summary}
                    </div>
                    {renderStoryWithHighlights()}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}