"use client"
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, 
  User,
  Scroll,
  ArrowLeft,
  FileText,
  Quote
} from 'lucide-react';
import data from '@/utils/data.json'

type RawCitation = {
  text: string;
  span: [number, number];
};

type RawDebater = {
  claim: string;
  arguments: string[];
};

type RawJudge = {
  questions: string[];
} | null;

type RawDebate = {
  story: string;
  question: string;
  debater1: RawDebater;
  debater2: RawDebater;
  judge: RawJudge;
  citations: RawCitation[];
};

const DEBATE_COLLECTION: { debates: RawDebate[] } = data as { debates: RawDebate[] };

export default function DebateDashboard() {
  const router = useRouter(); 
  const [selectedDebateIndex, setSelectedDebateIndex] = useState<number>(0);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);

  const [hoveredItem, setHoveredItem] = useState<{
    top: number;
    label: string;    
    title: string;    
    subtitle?: string; 
  } | null>(null);

  const currentDebate = useMemo(() => {
    const raw = DEBATE_COLLECTION.debates[selectedDebateIndex];
    if (!raw) return null;

    const enrichedCitations = raw.citations.map((c, i) => ({
      ...c,
      id: `cit-${i}`,
      sourceId: i + 1
    }));

    return {
      ...raw,
      citations: enrichedCitations,
    };
  }, [selectedDebateIndex]);

  const renderTextWithCitations = (text: string, citations: any[], color: 'blue' | 'rose') => {
    let parts: React.ReactNode[] = [text];

    citations.forEach((citation) => {
      const newParts: React.ReactNode[] = [];
      parts.forEach((part) => {
        if (typeof part === 'string') {
          const index = part.indexOf(citation.text);
          if (index !== -1) {
            const before = part.slice(0, index);
            const match = part.slice(index, index + citation.text.length);
            const after = part.slice(index + citation.text.length);
            
            if (before) newParts.push(before);
            newParts.push(
              <span 
                key={`${citation.id}-${index}`}
                onMouseEnter={() => setActiveCitationId(citation.id)}
                onMouseLeave={() => setActiveCitationId(null)}
                className={`
                  relative cursor-pointer px-0.5 rounded transition-colors duration-200
                  ${activeCitationId === citation.id 
                    ? 'bg-yellow-200 text-slate-900 font-semibold shadow-sm ring-1 ring-yellow-400' 
                    : `bg-${color}-50 text-slate-700 border-b-2 border-${color}-200 hover:bg-yellow-100`
                  }
                `}
              >
                {match}
                <sup className="ml-0.5 text-[9px] font-bold text-slate-500 bg-white/50 px-1 rounded-sm border border-slate-200">
                  {citation.sourceId}
                </sup>
              </span>
            );
            if (after) newParts.push(after);
          } else {
            newParts.push(part);
          }
        } else {
          newParts.push(part);
        }
      });
      parts = newParts;
    });

    return parts;
  };

  if (!currentDebate) return <div>Loading...</div>;

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-800 overflow-hidden relative">
      <nav className="w-20 bg-white flex-shrink-0 flex flex-col items-center border-r border-slate-200 py-4 gap-4 z-20 shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)]">
        <button 
            onClick={() => router.push('/dashboard')} 
            onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredItem({
                    top: rect.top,
                    label: 'EXIT',
                    title: 'Return to Dashboard',
                    subtitle: 'Close viewer'
                });
            }}
            onMouseLeave={() => setHoveredItem(null)}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-md group cursor-pointer"
        >
           <div className="relative w-5 h-5">
              <ArrowLeft size={20} className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <ArrowLeft size={20} className="absolute inset-0 opacity-100 group-hover:opacity-0 transition-opacity duration-200" />
           </div>
        </button>

        <div className="w-8 h-[1px] bg-slate-100" />

        <div className="flex-1 flex flex-col gap-3 w-full px-2 overflow-y-auto scrollbar-none pb-4">
            {DEBATE_COLLECTION.debates.map((d, i) => (
                <button
                    key={i}
                    onClick={() => setSelectedDebateIndex(i)}
                    onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredItem({
                            top: rect.top,
                            label: `CASE #${i + 1}`,
                            title: d.question,
                            subtitle: d.story
                        });
                    }}
                    onMouseLeave={() => setHoveredItem(null)}
                    className="relative group w-full flex justify-center flex-shrink-0"
                >
                    <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 border
                        ${selectedDebateIndex === i 
                            ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-inner' 
                            : 'bg-white text-slate-400 border-transparent hover:border-slate-200 hover:bg-slate-50'
                        }
                    `}>
                        {i + 1}
                    </div>
                </button>
            ))}
        </div>
      </nav>

      {hoveredItem && (
        <div 
            className="fixed left-20 z-50 w-64 bg-slate-800 text-white p-4 rounded-xl shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150"
            style={{ 
                top: hoveredItem.top,
                transform: 'translateY(-25%) translateX(12px)' 
            }}
        >
            <div className="absolute top-1/2 -left-1.5 w-3 h-3 bg-slate-800 transform -translate-y-1/2 rotate-45" />
            <div className="relative">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-widest">
                    {hoveredItem.label}
                </p>
                <p className="text-sm font-semibold leading-snug mb-2 text-slate-100">
                    {hoveredItem.title}
                </p>
                {hoveredItem.subtitle && (
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed opacity-80">
                        {hoveredItem.subtitle}
                    </p>
                )}
            </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-white">
        <div className="flex-1 grid grid-cols-12 min-h-0 divide-x divide-slate-200">
            
            <aside className="col-span-12 md:col-span-3 flex flex-col bg-slate-50/50 min-h-0">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                    <Scroll size={14} className="text-slate-500"/>
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Context Story</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="prose prose-sm prose-slate leading-relaxed text-slate-600 text-justify">
                        {currentDebate.story.split('\n').map((paragraph, i) => (
                            <p key={i} className="mb-4">{paragraph}</p>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="col-span-12 md:col-span-6 flex flex-col bg-white min-h-0">
                <div className="p-6 pb-2">
                    <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 text-center">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block tracking-widest">Case Question #{selectedDebateIndex + 1}</span>
                        <h2 className="text-xl font-semibold text-slate-800 leading-snug">{currentDebate.question}</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4 pb-2 border-b border-blue-100">
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0">
                                        <User size={14} />
                                    </div>
                                    <h4 className="font-bold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">Debater 1</h4>
                                </div>
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full uppercase tracking-wider border border-blue-100 text-right leading-tight">
                                    {currentDebate.debater1.claim}
                                </span>
                            </div>
                            
                            <div className="bg-white border border-blue-100 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow h-full">
                                <div className="space-y-4">
                                    {currentDebate.debater1.arguments.map((arg, i) => (
                                        <p key={i} className="text-sm text-slate-600 leading-7">
                                            {renderTextWithCitations(arg, currentDebate.citations, 'blue')}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4 pb-2 border-b border-rose-100">
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0">
                                        <User size={14} />
                                    </div>
                                    <h4 className="font-bold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">Debater 2</h4>
                                </div>
                                <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-3 py-1.5 rounded-full uppercase tracking-wider border border-rose-100 text-right leading-tight">
                                    {currentDebate.debater2.claim}
                                </span>
                            </div>

                            <div className="bg-white border border-rose-100 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow h-full">
                                <div className="space-y-4">
                                    {currentDebate.debater2.arguments.map((arg, i) => (
                                        <p key={i} className="text-sm text-slate-600 leading-7">
                                            {renderTextWithCitations(arg, currentDebate.citations, 'rose')}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {currentDebate.judge && (
                        <div className="mt-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-1 h-4 bg-slate-400 rounded-full"></div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Judge's Output</h3>
                                </div>
                                
                                {currentDebate.judge.questions && currentDebate.judge.questions.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-2">
                                        {currentDebate.judge.questions.map((q, i) => (
                                            <div key={i} className="text-slate-700 text-sm leading-relaxed flex gap-2">
                                                <span className="text-slate-400">•</span>
                                                <span>{q}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-sm italic">No active judge comments.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <aside className="col-span-12 md:col-span-3 flex flex-col bg-slate-50/50 min-h-0">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                    <BookOpen size={14} className="text-slate-500"/>
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Evidence</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
                    {currentDebate.citations.length === 0 ? (
                        <div className="text-center p-10 flex flex-col items-center justify-center opacity-50">
                            <FileText size={24} className="text-slate-400 mb-2"/>
                            <p className="text-slate-500 text-xs">No citations available.</p>
                        </div>
                    ) : (
                        currentDebate.citations.map((citation) => (
                            <div 
                                key={citation.id}
                                onMouseEnter={() => setActiveCitationId(citation.id)}
                                onMouseLeave={() => setActiveCitationId(null)}
                                className={`
                                    p-4 rounded-xl border text-sm cursor-pointer transition-all duration-200 group relative
                                    ${activeCitationId === citation.id 
                                    ? 'bg-slate-800 border-slate-800 text-white shadow-lg transform scale-[1.02] z-10' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm'
                                    }
                                `}
                            >
                                <div className="flex items-start gap-3">
                                    <span className={`
                                        flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold mt-0.5
                                        ${activeCitationId === citation.id 
                                            ? 'bg-white text-slate-900' 
                                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                                        }
                                    `}>
                                        {citation.sourceId}
                                    </span>
                                    <div className="space-y-1">
                                        <div className="flex items-start gap-2">
                                            <Quote size={12} className={`flex-shrink-0 mt-1 ${
                                                activeCitationId === citation.id ? 'text-slate-400' : 'text-slate-300'
                                            }`} />
                                            <p className="leading-snug italic font-medium">
                                                "{citation.text}"
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </aside>
        </div>
      </div>
    </div>
  );
}