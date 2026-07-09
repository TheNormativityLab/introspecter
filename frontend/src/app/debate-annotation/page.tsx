'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  ChevronUp, 
  ChevronDown,
  X,
  Save,
  MessageSquarePlus,
  Edit2,
  AlertCircle,
  Loader2,
  Move,
  PlayCircle,
  CheckCircle,
  AlertTriangle,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  Check,
  List,
  LayoutGrid,
  Target,
  FileText,
  Gavel,
  MessageSquare,
  Bug
} from 'lucide-react';
import { useParams, useRouter, usePathname } from "next/navigation";
import { DebateData } from '@/utils/debateData';
import { tutorialDebateFull } from '@/utils/tutorial_debate';
import { tutorialAnnotations } from '@/utils/tutorial_annotation';

const META_NORMS = [
  {
    category: "Factual Assertions",
    options: [
      { 
        label: "Provide reason to accept factual assertions (evidence, common knowledge)", 
        desc: "Provide a reason to accept as true all factual assertions (evidence, common knowledge, valid or reasonable inference from known facts)." 
      },
      { 
        label: "Evidence should be relevant and support argument", 
        desc: "Evidence should be relevant to and support argument or claim." 
      },
      { 
        label: "Present evidence accurately and fairly in context", 
        desc: "Present evidence accurately and fairly in light of context." 
      },
      { 
        label: "Don't rely on unsupported speculation", 
        desc: "Don't rely on unsupported speculation about facts." 
      }
    ]
  },
  {
    category: "Construction of Argument",
    options: [
      { 
        label: "Ensure arguments are responsive to the claim", 
        desc: "Ensure arguments are responsive to the claim." 
      },
      { 
        label: "Identify evidence to support arguments", 
        desc: "Identify evidence to support arguments." 
      },
      { 
        label: "Ensure inferences are valid or reasonable", 
        desc: "Ensure that inferences are valid or reasonable." 
      },
      { 
        label: "Address counterevidence", 
        desc: "Address counterevidence." 
      },
      { 
        label: "Address and join issue with counterarguments", 
        desc: "Address and join issue with counterarguments." 
      },
      { 
        label: "Ensure arguments use facts in consistent way", 
        desc: "Ensure arguments, even if in the alternative, use facts in consistent way. Ensure arguments are consistent throughout." 
      }
    ]
  },
  {
    category: "Strength of Argument",
    options: [
      { 
        label: "Rely on commonly believed/accepted facts", 
        desc: "Stronger arguments rely on more commonly believed/accepted facts (status quo, usual course of events, ordinary motivations, etc.)." 
      },
      { 
        label: "Rely on commonly accepted interpretations/semantics", 
        desc: "Stronger arguments rely on more commonly accepted interpretations of words/semantics/intent of language/speaker." 
      },
      { 
        label: "Argument is tightly tied to claim", 
        desc: "Stronger arguments are tightly tied to claim." 
      },
      { 
        label: "Argument is clear and easy to follow", 
        desc: "Stronger arguments are clearer and easier to follow." 
      },
      { 
        label: "Use analogies with closely related relevant facts", 
        desc: "Stronger arguments use analogies with more closely related relevant facts." 
      }
    ]
  }
];

type StorySpan = [number, number];

type DebateSentence = {
  id: string;
  text: string;
  highlighted: boolean;
  storySpan?: StorySpan;
  label?: string;
  normIndex?: string;
  explanationShort?: string;
  explanationLong?: string;
};

type SpeakerTurn = {
  round: number;
  speakerName: string;
  speakerSentences: DebateSentence[][] | DebateSentence[]; 
};

type DebateCase = {
  summary: string;
  story: string;
  question: string;
  debaterAClaim: string;
  debaterBClaim: string;
  debaterStatement?: DebateSentence[];
  debateTranscript: SpeakerTurn[];
};

type EvidenceLog = {
  id: string;
  sentenceIds: string[];
  sentenceTexts: string[];
  textSnippet: string;
  selectedNorms: string[];
  customNormText: string;
  reflection: string;
  timestamp: number;
};

type CaseEvidenceMap = {
  [caseKey: string]: EvidenceLog[];
};

type TooltipData = {
    explanationShort: string;
    explanationLong: string;
    norm: string;
};

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { icon: <LayoutGrid size={20} />, label: "Dashboard", path: "/" },
    { icon: <Target size={20} />, label: "Analysis Agent", path: "/harness" },
    { icon: <FileText size={20} />, label: "Debate Annotation", path: "/debate-annotation" },
    { icon: <MessageSquare size={20} />, label: "Basic Debate", path: "/debate/new" },
    { icon: <Bug size={20} />, label: "Debug", path: "/debate/debug" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
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

const ResizeHandle = ({ 
  onMouseDown,
  isLeft 
}: { 
  onMouseDown: (e: React.MouseEvent) => void,
  isLeft?: boolean
}) => (
  <div 
    className="w-4 flex items-center justify-center cursor-col-resize hover:bg-slate-200 transition-colors flex-shrink-0 z-10 group bg-slate-50 border-x border-slate-200"
    onMouseDown={onMouseDown}
  >
    <div className={`w-1 h-8 bg-slate-300 rounded-full group-hover:${isLeft ? 'bg-blue-400' : 'bg-indigo-400'} transition-colors`} />
  </div>
);

export default function DebateDashboard() {
  const router = useRouter();
  const [caseIndex, setCaseIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'tutorial' | 'annotation'>('annotation');
    
  const [rightWidth, setRightWidth] = useState<number>(35);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'summary' | 'story' | 'annotations'>('story');

  const [caseEvidenceMap, setCaseEvidenceMap] = useState<CaseEvidenceMap>({});
     
  const [activeHighlight, setActiveHighlight] = useState<{ 
    spans: StorySpan[], 
    currentIndex: number,
    source: 'debater' | 'opponent',
    sourceId: string
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartId, setDragStartId] = useState<string | null>(null);
  const [dragCurrentId, setDragCurrentId] = useState<string | null>(null);

  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{top: number, left: number} | null>(null);
     
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const popupDragOffset = useRef<{x: number, y: number}>({ x: 0, y: 0 });
     
  const [tutorialTooltip, setTutorialTooltip] = useState<{
    x: number;
    y: number;
    text: string;
    textShort: string;
    norm: string;
    type: 'violation' | 'good';
    highlightId: string;
    uniqueId: string; 
  } | null>(null);

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [pendingSelectionIds, setPendingSelectionIds] = useState<string[]>([]);
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null);
    
  const [selectedNorm, setSelectedNorm] = useState<string>("");
  const [customNormText, setCustomNormText] = useState<string>("");
  const [reflectionText, setReflectionText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
    
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [flyoutData, setFlyoutData] = useState<{
    top: number;
    left: number;
    label: string;
    desc: string;
  } | null>(null);
    
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [formErrors, setFormErrors] = useState<{ norms?: string, reflection?: string }>({});

  const storyContainerRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutDragMode = useRef<'right' | null>(null);

  const currentCase = viewMode === 'tutorial' 
    ? (tutorialDebateFull[caseIndex] as DebateCase)
    : (DebateData[caseIndex] as DebateCase);

  const getCurrentCaseKey = useCallback(() => {
    return viewMode === 'tutorial' ? `tutorial-${caseIndex}` : `case-${caseIndex}`;
  }, [viewMode, caseIndex]);

  const evidenceBank = useMemo(() => {
    const caseKey = getCurrentCaseKey();
    return caseEvidenceMap[caseKey] || [];
  }, [caseEvidenceMap, getCurrentCaseKey]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setFlyoutData(null); 
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const rounds = useMemo(() => {
    if (!currentCase) return [];
    const roundMap = new Map<number, { 
      debater: DebateSentence[][] | null, 
      opponent: DebateSentence[][] | null, 
      judge: DebateSentence[] | null,
      firstSpeaker: string | null 
    }>();
     
    currentCase.debateTranscript.forEach((turn) => {
      const rNum = turn.round;
      
      if (!roundMap.has(rNum)) {
        roundMap.set(rNum, { debater: null, opponent: null, judge: null, firstSpeaker: turn.speakerName });
      }
      
      const roundObj = roundMap.get(rNum)!;
      
      if (turn.speakerName === "Debater A") roundObj.debater = turn.speakerSentences as DebateSentence[][];
      else if (turn.speakerName === "Debater B") roundObj.opponent = turn.speakerSentences as DebateSentence[][];
      else if (turn.speakerName === "Judge") roundObj.judge = turn.speakerSentences as DebateSentence[];
    });
     
    return Array.from(roundMap.entries()).sort((a, b) => a[0] - b[0]).map(([, data]) => data);
  }, [currentCase]);

  const flatSentences = useMemo(() => {
    const sents: { id: string, text: string }[] = [];
    rounds.forEach((round, rIdx) => {
        const isJudgeFirst = round.firstSpeaker === "Judge";
        
        if (isJudgeFirst && round.judge) round.judge.forEach((s, i) => sents.push({ id: s.id || `${rIdx}-judge-${i}`, text: s.text }));
        if (round.debater) round.debater.flat().forEach((s, i) => sents.push({ id: s.id || `${rIdx}-debater-${i}`, text: s.text }));
        if (round.opponent) round.opponent.flat().forEach((s, i) => sents.push({ id: s.id || `${rIdx}-opponent-${i}`, text: s.text }));
        if (!isJudgeFirst && round.judge) round.judge.forEach((s, i) => sents.push({ id: s.id || `${rIdx}-judge-${i}`, text: s.text }));
    });
    return sents;
  }, [rounds]);
    
  const flatSentenceIds = useMemo(() => flatSentences.map(s => s.id), [flatSentences]);

  const currentDragSelection = useMemo(() => {
    if (!isDragging || !dragStartId || !dragCurrentId) return [];
    const startIndex = flatSentenceIds.indexOf(dragStartId);
    const endIndex = flatSentenceIds.indexOf(dragCurrentId);
    if (startIndex === -1 || endIndex === -1) return [];
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    return flatSentenceIds.slice(start, end + 1);
  }, [isDragging, dragStartId, dragCurrentId, flatSentenceIds]);

  const getSentenceAnnotations = useCallback((sentId: string) => {
    if (viewMode !== 'tutorial') return [];
     
    const annotationsForCase = tutorialAnnotations[caseIndex] || [];
     
    return annotationsForCase.filter(annotation => {
      if (annotation.sentenceStart === sentId) return true;
      
      if (annotation.sentenceStart !== annotation.sentenceEnd) {
        const parseId = (id: string) => {
          const match = id.match(/sentence(\d+)$/);
          return match ? parseInt(match[1], 10) : -1;
        };
        
        const currentNum = parseId(sentId);
        const startNum = parseId(annotation.sentenceStart);
        const endNum = parseId(annotation.sentenceEnd);
        
        const getBase = (id: string) => id.substring(0, id.lastIndexOf('-sentence'));
        const currentBase = getBase(sentId);
        const startBase = getBase(annotation.sentenceStart);
        
        if (currentBase === startBase && currentNum >= startNum && currentNum <= endNum) {
          return true;
        }
      }
      return false;
    });
  }, [viewMode, caseIndex]);

  const handlePopupMouseDown = (e: React.MouseEvent) => {
    if (!popupPosition) return;
    setIsDraggingPopup(true);
    popupDragOffset.current = {
      x: e.clientX - popupPosition.left,
      y: e.clientY - popupPosition.top
    };
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (layoutDragMode.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const percentage = (relativeX / rect.width) * 100;
        
        if (layoutDragMode.current === 'right') {
          const newRight = 100 - percentage;
          if (newRight < 5) {
            setIsRightCollapsed(true);
            setRightWidth(30); 
          } else {
            setIsRightCollapsed(false);
            setRightWidth(Math.min(newRight, 80)); 
          }
        }
      }

      if (isDraggingPopup && popupPosition) {
        setPopupPosition({
          left: e.clientX - popupDragOffset.current.x,
          top: e.clientY - popupDragOffset.current.y
        });
      }
    };

    const handleGlobalMouseUp = () => {
      layoutDragMode.current = null;
      setIsDraggingPopup(false);
      document.body.style.cursor = 'default';
      
      if (isDragging && currentDragSelection.length > 0) {
        setPendingSelectionIds(currentDragSelection);
        setEditingLogId(null);
        setSelectedNorm("");
        setCustomNormText("");
        setReflectionText("");
        setFormErrors({});
        setIsDropdownOpen(false);

        const popupWidth = 600;
        const popupHeight = 600;
        const rightMargin = 20;
        const bottomMargin = 20;
        
        setPopupPosition({ 
          top: window.innerHeight - popupHeight - bottomMargin,
          left: window.innerWidth - popupWidth - rightMargin
        });
        setShowPopup(true);
        setIsDragging(false);
        setDragStartId(null);
        setDragCurrentId(null);
        window.getSelection()?.removeAllRanges();
      } else if (isDragging) {
        setIsDragging(false);
        setDragStartId(null);
        setDragCurrentId(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [rightWidth, isDraggingPopup, isDragging, currentDragSelection, viewMode, isRightCollapsed, popupPosition]);

  const handleSetHighlight = useCallback((text: string, source: 'debater' | 'opponent', id: string, manualSpan?: StorySpan) => {
    if (!text || !currentCase.story) return;
    
    setActiveRightTab('story');
    if (isRightCollapsed) setIsRightCollapsed(false);

    const spans: StorySpan[] = [];
    
    if (manualSpan) {
      spans.push(manualSpan);
    } else {
      const storyText = currentCase.story.toLowerCase();
      const searchText = text.toLowerCase().trim();
      
      let pos = storyText.indexOf(searchText);
      
      if (pos === -1) {
        const cleanStory = storyText.replace(/[.,!?;:"'"]/g, ' ').replace(/\s+/g, ' ');
        const cleanSearch = searchText.replace(/[.,!?;:"'"]/g, ' ').replace(/\s+/g, ' ');
        const cleanPos = cleanStory.indexOf(cleanSearch);
        
        if (cleanPos !== -1) {
          pos = cleanPos;
        }
      }

      while (pos !== -1 && pos < storyText.length) {
        spans.push([pos, pos + searchText.length]);
        pos = storyText.indexOf(searchText, pos + 1);
      }
    }

    setActiveHighlight({ spans, currentIndex: 0, source, sourceId: id });
  }, [currentCase.story, isRightCollapsed]);

  const cycleMatch = (direction: 'next' | 'prev', e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!activeHighlight) return;
    const { spans, currentIndex } = activeHighlight;
    let nextIdx = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (nextIdx >= spans.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = spans.length - 1;

    setActiveHighlight({ ...activeHighlight, currentIndex: nextIdx });
  };

  useEffect(() => {
    if (activeHighlight && storyContainerRef.current) {
      const timer = setTimeout(() => {
        const activeEl = storyContainerRef.current?.querySelector('#active-story-match');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeHighlight, activeHighlight?.currentIndex]);

  useEffect(() => {
    if (transcriptContainerRef.current) {
        transcriptContainerRef.current.scrollTop = 0;
    }
    if (rightPanelRef.current) {
        setTimeout(() => {
            if (rightPanelRef.current) rightPanelRef.current.scrollTop = 0;
        }, 0);
    }
  }, [caseIndex, viewMode, activeRightTab]);

  const handleClosePopup = () => {
    setShowPopup(false);
    setEditingLogId(null);
    setPendingSelectionIds([]);
    setSelectedNorm("");
    setCustomNormText("");
    setReflectionText("");
    setFormErrors({});
    setIsSaving(false);
    setIsDropdownOpen(false);
    setFlyoutData(null);
  };
    
  const handleTextMouseDown = (sentId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    
    if (showPopup) {
      setPendingSelectionIds(prev => {
        if (prev.includes(sentId)) {
          return prev.filter(id => id !== sentId);
        } else {
          return [...prev, sentId];
        }
      });
      return;
    }
    
    setIsDragging(true);
    setDragStartId(sentId);
    setDragCurrentId(sentId);
  };

  const handleEditLog = (log: EvidenceLog, e: React.MouseEvent) => {
    e.stopPropagation(); 
    
    setEditingLogId(log.id);
    setPendingSelectionIds(log.sentenceIds);
    
    let normToSet = log.selectedNorms[0] || "";
    if (normToSet !== "Other") {
        const foundByDesc = META_NORMS.flatMap(g => g.options).find(o => o.desc === normToSet);
        if (foundByDesc) {
            normToSet = foundByDesc.label;
        } else {
             const foundByLabel = META_NORMS.flatMap(g => g.options).find(o => o.label === normToSet);
             if (foundByLabel) normToSet = foundByLabel.label;
        }
    }
    
    setSelectedNorm(normToSet);
    setCustomNormText(log.customNormText);
    setReflectionText(log.reflection);
    setFormErrors({});
    setIsDropdownOpen(false);

    const popupWidth = 600;
    const popupHeight = 600;
    const rightMargin = 20;
    const bottomMargin = 20;
    
    setPopupPosition({ 
      top: window.innerHeight - popupHeight - bottomMargin,
      left: window.innerWidth - popupWidth - rightMargin
    });
    setShowPopup(true);
  };

  const handleDeleteLog = async (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this evidence log?')) {
      return;
    }

    const caseKey = getCurrentCaseKey();
    setCaseEvidenceMap(prev => ({
      ...prev,
      [caseKey]: (prev[caseKey] || []).filter(log => log.id !== logId)
    }));
  };

  const handleSaveEvidence = useCallback(async () => {
    if (pendingSelectionIds.length === 0) {
      setFormErrors({ norms: "Please select at least one sentence from the transcript." });
      return;
    }

    const errors: { norms?: string, reflection?: string } = {};
    if (!selectedNorm) errors.norms = "Please select a violation.";
    if (selectedNorm === "Other" && !customNormText.trim()) {
      errors.norms = "Please specify the 'Other' violation or choose another option.";
    }
    if (!reflectionText.trim()) errors.reflection = "Reflection cannot be empty.";
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);

    const sentenceTexts: string[] = pendingSelectionIds.map(
      id => flatSentences.find(s => s.id === id)?.text ?? ''
    );

    const fullText = sentenceTexts.join(" ");
    const snippet = fullText.length > 100 ? fullText.substring(0, 100) + "..." : fullText;

    const timestamp = Date.now();
    const id = editingLogId || crypto.randomUUID(); 

    let normToSave = selectedNorm;
    if (selectedNorm !== "Other") {
        const foundOption = META_NORMS.flatMap(g => g.options).find(o => o.label === selectedNorm);
        if (foundOption) {
            normToSave = foundOption.desc;
        }
    }
    const normList = [normToSave];

    const logData: EvidenceLog = {
      id,
      sentenceIds: pendingSelectionIds,
      sentenceTexts,
      textSnippet: snippet,
      selectedNorms: normList,
      customNormText,
      reflection: reflectionText,
      timestamp
    };

    const caseKey = getCurrentCaseKey();
    
    if (editingLogId) {
      setCaseEvidenceMap(prev => ({
        ...prev,
        [caseKey]: (prev[caseKey] || []).map(log => log.id === editingLogId ? logData : log)
      }));
    } else {
      setCaseEvidenceMap(prev => ({
        ...prev,
        [caseKey]: [logData, ...(prev[caseKey] || [])]
      }));
    }

    setActiveRightTab('annotations');
    if (isRightCollapsed) setIsRightCollapsed(false);
    
    handleClosePopup();
  }, [editingLogId, pendingSelectionIds, flatSentences, selectedNorm, customNormText, reflectionText, caseIndex, viewMode, getCurrentCaseKey, isRightCollapsed]);

  const handleReflectionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setReflectionText(val);
    if (formErrors.reflection && val.trim().length > 0) {
      setFormErrors(prev => ({ ...prev, reflection: undefined }));
    }
  };

  const renderInteractiveSentences = (sentences: DebateSentence[], side: 'debater' | 'opponent' | 'judge', roundIndex: number) => {
    const activeIds = isDragging ? new Set(currentDragSelection) : new Set(pendingSelectionIds);
    const isPopupOpen = showPopup;
    const isJudge = side === 'judge';
    const isTutorial = viewMode === 'tutorial';

    let panelHasIcons = false;
    
    if (isTutorial) {
        panelHasIcons = sentences.some((sent, idx) => {
            const sentId = sent.id || `${roundIndex}-${side}-${idx}`;
            const annotations = getSentenceAnnotations(sentId);
            return annotations.some(a => a.sentenceStart === sentId);
        });
    } else {
        panelHasIcons = sentences.some((sent, idx) => {
            const sentId = sent.id || `${roundIndex}-${side}-${idx}`;
            return evidenceBank.some(log => log.sentenceIds[0] === sentId);
        });
    }
    
    return (
      <div className="flex flex-col gap-1 select-none">
        {sentences.map((sent, idx) => {
          const sentId = sent.id || `${roundIndex}-${side}-${idx}`;
          const isSelected = activeIds.has(sentId);
          const isPending = pendingSelectionIds.includes(sentId);
          
          let bgClass = isJudge ? "" : "hover:bg-slate-100";
          let borderClass = "bg-transparent";
          let textClass = "text-slate-700";

          let iconData: {
            type: 'violation' | 'good',
            tooltip: TooltipData,
            logId?: string,
            uniqueId?: string 
          }[] = [];

          if (isTutorial) {
              const annotations = getSentenceAnnotations(sentId);
              const startingAnnotations = annotations.filter(a => a.sentenceStart === sentId);
              
              if (startingAnnotations.length > 0) {
                  iconData = startingAnnotations.map(firstAnn => ({
                      type: firstAnn.label === 'violation' ? 'violation' : 'good',
                      tooltip: {
                        explanationShort: firstAnn.explanationShort || "",
                        explanationLong: firstAnn.explanationLong || "",
                        norm: firstAnn.norm || ""
                      },
                      uniqueId: `${firstAnn.sentenceStart}-${firstAnn.norm}`
                  }));
              }

              if (annotations.length > 0) {
                const activeTooltipAnnotation = annotations.find(
                    a => tutorialTooltip?.uniqueId === `${a.sentenceStart}-${a.norm}`
                );

                if (activeTooltipAnnotation) {
                    const isViolation = activeTooltipAnnotation.label === 'violation';
                    bgClass = isViolation ? "bg-red-50" : "bg-green-50";
                    textClass = isViolation ? "text-red-900" : "text-green-900";
                }
              }
          } else {
              const associatedLogs = evidenceBank.filter(log => log.sentenceIds.includes(sentId));
              
              if (associatedLogs.length > 0) {
                  if (hoveredLogId && associatedLogs.some(log => log.id === hoveredLogId)) {
                      bgClass = "bg-red-50";
                      textClass = "text-red-900";
                  }
                  
                  const startingLogs = associatedLogs.filter(log => log.sentenceIds[0] === sentId);
                  
                  if (startingLogs.length > 0) {
                      iconData = startingLogs.map(log => ({
                          type: 'violation',
                          tooltip: {
                              explanationShort: "Annotated",
                              explanationLong: log.reflection,
                              norm: log.selectedNorms.join(', ')
                          },
                          logId: log.id 
                      }));
                  }
              }
          }

          if (!isJudge && isSelected) {
            bgClass = isPending ? "bg-purple-100" : "bg-red-100";
            textClass = isPending ? "text-purple-900" : "text-red-900";
            borderClass = isPending ? "bg-purple-500" : "bg-red-500";
          } else if (!isJudge && isPopupOpen) {
            bgClass = "hover:bg-purple-50 cursor-pointer";
          }

          return (
            <div
              key={sentId}
              onMouseDown={isJudge ? undefined : (e) => handleTextMouseDown(sentId, e)}
              onMouseEnter={isJudge ? undefined : () => {
                if (isDragging) { 
                    setDragCurrentId(sentId); 
                    return; 
                }
                
                if (!showPopup) {
                    if (sent.highlighted || sent.storySpan) {
                        const sourceType = side === 'debater' ? 'debater' : 'opponent';
                        handleSetHighlight(sent.text, sourceType, sentId, sent.storySpan);
                    }
                }
              }}
              className={`group relative flex w-full ${isJudge ? '' : 'cursor-pointer'} rounded-r-md transition-colors duration-75 ${bgClass} ${panelHasIcons ? 'pl-7 py-1' : 'py-1'}`}
            >
              <div className={`w-1 absolute left-0 top-0 bottom-0 transition-colors ${borderClass} ${isSelected ? 'opacity-100' : 'opacity-0'}`} />

              {iconData.length > 0 && (
                <div className="absolute left-1 top-1 flex flex-col gap-1 items-center z-20">
                      {iconData.map((data, iIdx) => (
                        <div
                            key={iIdx}
                            className="cursor-help transition-transform hover:scale-110"
                            onMouseEnter={(e) => {
                                e.stopPropagation();
                                
                                if (data.logId) setHoveredLogId(data.logId);

                                const rect = e.currentTarget.getBoundingClientRect();
                                setTutorialTooltip({
                                    x: rect.left + 20,
                                    y: rect.top - 10,
                                    text: data.tooltip.explanationLong,
                                    textShort: data.tooltip.explanationShort,
                                    norm: data.tooltip.norm,
                                    type: data.type,
                                    highlightId: sentId,
                                    uniqueId: data.uniqueId || `${sentId}-tooltip-${iIdx}`
                                });

                                if (!showPopup) {
                                  if (sent.highlighted || sent.storySpan) {
                                    const sourceType: 'debater' | 'opponent' = side === 'debater' ? 'debater' : 'opponent';
                                    handleSetHighlight(sent.text, sourceType, sentId, sent.storySpan);
                                  } else {
                                    setActiveHighlight({ spans: [], currentIndex: 0, source: side === 'debater' ? 'debater' : 'opponent', sourceId: sentId });
                                  }
                                }
                            }}
                            onMouseLeave={() => {
                                setTutorialTooltip(null);
                                setActiveHighlight(null);
                                setHoveredLogId(null);
                            }}
                        >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ring-1 ring-white ${data.type === 'violation' ? 'bg-red-500' : 'bg-green-500'}`}>
                                {data.type === 'violation' ? '-' : '+'}
                            </div>
                        </div>
                      ))}
                </div>
              )}
              
              <div className="w-8 flex-shrink-0 pt-1 pl-1 flex items-start">
                <span className={`text-[9px] font-mono font-medium ${isSelected ? 'text-red-500' : 'text-slate-300'}`}>[{idx + 1}]</span>
              </div>
              
              <div className={`flex-1 py-1 pr-2 text-sm leading-relaxed ${sent.highlighted && !isSelected ? 'text-blue-700 decoration-blue-200 underline decoration-2 underline-offset-4' : ''} ${textClass}`}>
                {sent.highlighted && !isSelected ? (
                  <div className="flex gap-2 items-start">
                    <div className="w-1 bg-blue-600 rounded-full flex-shrink-0 mt-1 self-stretch min-h-[1.2em]" />
                    <span className="flex-1">{sent.text}</span>
                  </div>
                ) : (
                  sent.text
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStoryWithHighlights = () => {
    const story = currentCase.story;
    if (!activeHighlight || activeHighlight.spans.length === 0) return <div className="whitespace-pre-wrap">{story}</div>;

    const { spans, currentIndex, source } = activeHighlight;
    const elements: React.ReactNode[] = [];
    let lastPos = 0;

    spans.forEach((span, idx) => {
      const [start, end] = span;
      elements.push(story.slice(lastPos, start));
      
      const isActive = idx === currentIndex;
      const baseColor = source === 'debater' ? 'blue' : 'rose';
      
      elements.push(
        <span
          key={idx}
          id={isActive ? "active-story-match" : undefined}
          className={`transition-all duration-200 rounded-sm px-0.5 ${isActive ? `bg-${baseColor}-200 text-${baseColor}-900 ring-2 ring-${baseColor}-400 font-bold z-10` : `bg-${baseColor}-100/40 text-${baseColor}-800/50`}`}
        >
          {story.slice(start, end)}
        </span>
      );
      lastPos = end;
    });

    elements.push(story.slice(lastPos));
    return <div className="whitespace-pre-wrap">{elements}</div>;
  };

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-800 overflow-hidden relative">
      {isDropdownOpen && flyoutData && (
        <div 
            style={{ 
                top: flyoutData.top, 
                left: flyoutData.left - 320,
            }}
            className="fixed w-72 bg-slate-800 text-white p-4 rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-100 pointer-events-none"
        >
            <div className="absolute top-4 -right-1 w-2 h-2 bg-slate-800 rotate-45"></div>
            <div className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider border-b border-slate-600 pb-1">{flyoutData.label}</div>
            <div className="text-sm leading-relaxed text-slate-100 font-light">
                {flyoutData.desc}
            </div>
        </div>
      )}
      
      {tutorialTooltip && (
          <div 
            style={{ top: tutorialTooltip.y, left: tutorialTooltip.x }}
            className={`fixed z-[60] w-80 p-4 rounded-lg shadow-2xl border animate-in fade-in zoom-in-95 duration-150 pointer-events-none -translate-y-full origin-bottom-left ${
              tutorialTooltip.type === 'violation' ? 'bg-red-50 border-red-300 text-red-900' : 'bg-green-50 border-green-300 text-green-900'
            }`}
          >
              <div className="flex items-start gap-2 mb-2">
                  {tutorialTooltip.type === 'violation' ? <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/> : <CheckCircle size={16} className="flex-shrink-0 mt-0.5"/>}
                  <h4 className="font-bold text-xs uppercase tracking-wider">{tutorialTooltip.textShort}</h4>
              </div>
              
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-2 py-1 rounded ${
                  tutorialTooltip.type === 'violation' ? 'bg-red-100' : 'bg-green-100'
              }`}>
                  Norm: {tutorialTooltip.norm}
              </div>
              
              <p className="text-sm leading-snug">{tutorialTooltip.text}</p>
          </div>
      )}

      {showPopup && popupPosition && (
        <div 
          style={{ top: popupPosition.top, left: popupPosition.left }}
          className={`fixed z-50 w-[600px] h-[600px] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-100 ${isDraggingPopup ? 'cursor-grabbing' : ''}`}
        >
          <div 
            onMouseDown={handlePopupMouseDown}
            className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <MessageSquarePlus size={14} /> 
                {editingLogId ? 'Edit Evidence Log' : 'Log Violation'}
              </span>
              <span className="text-[10px] text-slate-400">
                Click sentences in transcript to add/remove
              </span>
            </div>
            <div className="flex items-center gap-2">
               <Move size={14} className="text-slate-300" />
               <button onClick={handleClosePopup} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
            </div>
          </div>
          
          <div className="p-5 flex flex-col gap-6 overflow-visible">
            {pendingSelectionIds.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 overflow-y-auto max-h-[100px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-700 uppercase">Selected Sentences</span>
                  <span className="text-[10px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full font-bold">
                    {pendingSelectionIds.length} selected
                  </span>
                </div>
                <p className="text-xs text-purple-700 italic leading-relaxed">
                  {pendingSelectionIds.map(id => flatSentences.find(s => s.id === id)?.text ?? '').join(' ')}
                </p>
              </div>
            )}
            
            <div className="relative">
              <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center justify-between">
                Norm Violated
                <span className="text-xs text-slate-400 font-normal">Choose one</span>
              </label>
              
              <div 
                ref={dropdownRef}
                className="relative"
              >
                <div 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`w-full text-sm p-3 border rounded-lg cursor-pointer bg-white flex items-center justify-between shadow-sm transition-all ${formErrors.norms ? 'border-red-300 ring-2 ring-red-100' : isDropdownOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-300 hover:border-blue-400'}`}
                >
                    <span className={`block truncate mr-4 ${selectedNorm ? 'text-slate-800' : 'text-slate-400'}`}>
                        {selectedNorm || "Select a violation..."}
                    </span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[300px] overflow-y-auto z-[60] animate-in fade-in zoom-in-95 duration-100">
                        {META_NORMS.map((group, idx) => (
                            <div key={idx}>
                                <div className="bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                    {group.category}
                                </div>
                                {group.options.map((opt, oIdx) => (
                                    <div 
                                        key={oIdx}
                                        onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setFlyoutData({
                                                top: rect.top,
                                                left: rect.left,
                                                label: opt.label,
                                                desc: opt.desc
                                            });
                                        }}
                                        onMouseLeave={() => setFlyoutData(null)}
                                        onClick={() => {
                                            setSelectedNorm(opt.label);
                                            setIsDropdownOpen(false);
                                            setFlyoutData(null);
                                            if (formErrors.norms) setFormErrors(prev => ({ ...prev, norms: undefined }));
                                        }}
                                        className="px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer border-b border-slate-50 last:border-0 group relative flex justify-between items-center"
                                    >
                                        <span className="truncate pr-4">{opt.label}</span>
                                        {selectedNorm === opt.label && <Check size={14} className="text-blue-600 flex-shrink-0"/>}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <div className="flex border-t border-slate-100">
                           <div 
                              onClick={() => {
                                 setSelectedNorm("Unsure");
                                 setIsDropdownOpen(false);
                                 setFlyoutData(null);
                                 if (formErrors.norms) setFormErrors(prev => ({ ...prev, norms: undefined }));
                              }}
                              className="flex-1 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer font-medium border-r border-slate-100 text-center"
                           >
                             Unsure
                           </div>
                           <div 
                              onClick={() => {
                                 setSelectedNorm("Other");
                                 setIsDropdownOpen(false);
                                 setFlyoutData(null);
                              }}
                              className="flex-1 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer font-medium text-center"
                           >
                             Other
                           </div>
                        </div>
                    </div>
                )}
              </div>
              
              {formErrors.norms && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-500 animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={12} />
                    <span className="text-xs font-medium">{formErrors.norms}</span>
                </div>
              )}

              {selectedNorm === "Other" && (
                  <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                      <input 
                          type="text"
                          className={`w-full text-sm p-2.5 border rounded-lg focus:ring-2 outline-none shadow-sm ${formErrors.norms ? 'border-red-300 focus:ring-red-200' : 'border-slate-300 focus:ring-blue-500'}`}
                          placeholder="Specify the violation..."
                          value={customNormText}
                          onChange={(e) => {
                            setCustomNormText(e.target.value);
                            if (formErrors.norms && e.target.value.trim().length > 0) {
                              setFormErrors(prev => ({ ...prev, norms: undefined }));
                            }
                          }}
                          autoFocus
                      />
                  </div>
              )}
            </div>

            <div className="flex-1 flex flex-col">
              <label className="text-sm font-semibold text-slate-700 mb-1 flex justify-between items-end">
                Reflection
              </label>
              <textarea 
                className={`w-full flex-1 text-sm p-3 border rounded-lg focus:ring-2 outline-none resize-none leading-relaxed shadow-sm min-h-[100px] ${formErrors.reflection ? 'border-red-300 focus:ring-red-200' : 'border-slate-300 focus:ring-blue-500'}`}
                placeholder="Explain why the selected text violates the norms..."
                value={reflectionText}
                onChange={handleReflectionChange}
              />
              {formErrors.reflection && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-500 animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={12} />
                    <span className="text-xs font-medium">{formErrors.reflection}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50 rounded-b-xl shrink-0">
            <button 
              onClick={handleClosePopup}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveEvidence}
              disabled={isSaving || (pendingSelectionIds.length === 0 || !selectedNorm || reflectionText.trim().length === 0 || (selectedNorm === "Other" && !customNormText.trim()))}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm flex items-center gap-2 transition-all ${
                (isSaving || pendingSelectionIds.length === 0 || !selectedNorm || reflectionText.trim().length === 0 || (selectedNorm === "Other" && !customNormText.trim())) 
                  ? 'bg-slate-400 cursor-not-allowed opacity-75' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? 'Saving...' : (editingLogId ? 'Update' : 'Save')}
            </button>
          </div>
        </div>
      )}

      <Sidebar />

      <nav className="w-16 bg-white flex-shrink-0 flex flex-col items-center border-r border-slate-200 py-4 gap-3 z-20 shadow-sm">
        <div className="w-8 h-[1px] bg-slate-200" />
        
        <div className="flex flex-col gap-2 w-full px-2">
          <button
            onClick={() => {
              handleClosePopup();
              setViewMode('tutorial');
              setCaseIndex(0);
              setActiveHighlight(null);
            }}
            className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
              viewMode === 'tutorial'
                ? 'bg-blue-100 text-blue-700 shadow-inner'
                : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            }`}
            title="Interactive Tutorial"
          >
            <PlayCircle size={20} />
          </button>
          <button
            onClick={() => {
              handleClosePopup();
              setViewMode('annotation');
              setCaseIndex(0);
              setActiveHighlight(null);
            }}
            className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
              viewMode === 'annotation'
                ? 'bg-emerald-100 text-emerald-700 shadow-inner'
                : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            }`}
            title="Annotation Tasks"
          >
            <Edit2 size={20} />
          </button>
        </div>

        <div className="w-8 h-[1px] bg-slate-200 mt-1 mb-1" />
        
        <div className="flex-1 flex flex-col gap-2 w-full px-2 overflow-y-auto scrollbar-none">
          {viewMode === 'tutorial' ? (
            tutorialDebateFull.map((_, i) => (
              <button
                key={`tut-${i}`}
                onClick={() => {
                  handleClosePopup();
                  setCaseIndex(i);
                  setActiveHighlight(null);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold mx-auto transition-all ${
                  caseIndex === i
                    ? 'bg-blue-600 text-white shadow-md scale-105'
                    : 'bg-white text-slate-400 border border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {i + 1}
              </button>
            ))
          ) : (
            DebateData.map((_, i) => (
              <button
                key={`ann-${i}`}
                onClick={() => {
                  handleClosePopup();
                  setCaseIndex(i);
                  setActiveHighlight(null);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mx-auto transition-all ${
                  caseIndex === i
                    ? 'bg-emerald-600 text-white shadow-md scale-105'
                    : 'bg-white text-slate-400 border border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {i + 1}
              </button>
            ))
          )}
        </div>
      </nav>

      <div ref={containerRef} className="flex-1 flex min-h-0 bg-white">
        
        <div className="flex-1 flex flex-col min-w-[350px] bg-slate-50/50">
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex flex-col gap-4 overflow-x-hidden">
                <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                        {viewMode === 'tutorial' ? `Tutorial Question #${caseIndex + 1}` : `Question #${caseIndex + 1}`}
                    </span>
                    <h2 className="text-lg font-bold text-slate-800 leading-tight">{currentCase.question}</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full text-xs">
                    <div className="bg-blue-50 p-2 rounded border border-blue-100"><span className="font-bold text-blue-600 uppercase mb-1 block">Debater A&apos;s Claim</span>{currentCase.debaterAClaim}</div>
                    <div className="bg-indigo-50 p-2 rounded border border-indigo-100 text-right"><span className="font-bold text-indigo-600 uppercase mb-1 block">Debater B&apos;s Claim</span>{currentCase.debaterBClaim}</div>
                </div>
            </div>

            <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300">
                <div className="flex flex-col pb-12">
                   {rounds.map((round, rIndex) => (
                       <React.Fragment key={rIndex}>
                           {round.firstSpeaker === "Judge" && round.judge && (
                               <div className="w-full mb-6 bg-stone-100 border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                                   <div className="bg-stone-50 px-3 py-1 text-[10px] font-bold text-stone-600 border-b border-stone-200 uppercase tracking-widest text-center">Judge&apos;s Commentary</div>
                                   <div className="p-4 bg-white/50">{renderInteractiveSentences(round.judge, 'judge', rIndex)}</div>
                               </div>
                           )}

                           {round.debater && (
                               <div className="w-[85%] self-start mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                   <div className="bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-600 border-b border-blue-100 uppercase tracking-tight">Debater A</div>
                                   <div className="p-2">{renderInteractiveSentences(round.debater.flat(), 'debater', rIndex)}</div>
                               </div>
                           )}
                           {round.opponent && (
                               <div className="w-[85%] self-end mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-right">
                                   <div className="bg-indigo-50 px-3 py-1 text-[10px] font-bold text-indigo-600 border-b border-indigo-100 uppercase tracking-tight text-right">Debater B</div>
                                   <div className="p-2 text-left">{renderInteractiveSentences(round.opponent.flat(), 'opponent', rIndex)}</div>
                               </div>
                           )}
                           
                           {round.firstSpeaker !== "Judge" && round.judge && (
                               <div className="w-full mb-8 bg-stone-100 border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                                   <div className="bg-stone-50 px-3 py-1 text-[10px] font-bold text-stone-600 border-b border-stone-200 uppercase tracking-widest text-center">Judge&apos;s Commentary</div>
                                   <div className="p-4 bg-white/50">{renderInteractiveSentences(round.judge, 'judge', rIndex)}</div>
                               </div>
                           )}
                       </React.Fragment>
                   ))}
                </div>
            </div>
        </div>

        {!isRightCollapsed ? (
            <>
            <ResizeHandle isLeft={false} onMouseDown={() => { layoutDragMode.current = 'right'; document.body.style.cursor = 'col-resize'; }} />
            <div style={{ width: `${rightWidth}%` }} className="flex flex-col min-w-[300px] bg-white border-l border-slate-200">
                <div className="border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-20">
                    <div className="flex px-2 pt-2 gap-1">
                         <button 
                            onClick={() => setActiveRightTab('summary')}
                            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors ${activeRightTab === 'summary' ? 'bg-slate-100 text-slate-700 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                         >
                           Summary
                         </button>
                         <button 
                            onClick={() => setActiveRightTab('story')}
                            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors ${activeRightTab === 'story' ? 'bg-slate-100 text-slate-700 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                         >
                           Story
                         </button>
                         <button 
                            onClick={() => setActiveRightTab('annotations')}
                            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors ${activeRightTab === 'annotations' ? 'bg-slate-100 text-slate-700 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                         >
                           Annotations ({evidenceBank.length})
                         </button>
                    </div>

                    <div className="flex items-center gap-1 pr-2 pb-1">
                        {activeRightTab === 'story' && activeHighlight && activeHighlight.spans.length > 1 && (
                            <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1 border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-200 mr-2">
                                <span className="text-[10px] font-mono font-bold px-2 text-slate-500">
                                {activeHighlight.currentIndex + 1} / {activeHighlight.spans.length}
                                </span>
                                <div className="flex gap-0.5">
                                <button 
                                    onMouseDown={(e) => cycleMatch('prev', e)}
                                    className="p-1 hover:bg-white rounded transition-colors text-slate-600"
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button 
                                    onMouseDown={(e) => cycleMatch('next', e)}
                                    className="p-1 hover:bg-white rounded transition-colors text-slate-600"
                                >
                                    <ChevronDown size={14} />
                                </button>
                                </div>
                            </div>
                        )}
                        <button 
                            onClick={() => setIsRightCollapsed(true)}
                            className="p-1 rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-colors"
                            title="Collapse"
                        >
                            <PanelRightClose size={16} />
                        </button>
                    </div>
                </div>

                <div ref={rightPanelRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 bg-slate-50/30">
                    {activeRightTab === 'summary' && (
                         <div className="p-6">
                            <div className="p-5 bg-white rounded-2xl text-sm text-slate-600 border border-slate-200 shadow-sm leading-relaxed relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-400" />
                                {currentCase.summary}
                            </div>
                        </div>
                    )}

                    {activeRightTab === 'story' && (
                        <div ref={storyContainerRef} className="p-8">
                            <div className="prose prose-slate max-w-none font-serif leading-loose text-slate-700 text-base">
                                {renderStoryWithHighlights()}
                            </div>
                        </div>
                    )}

                    {activeRightTab === 'annotations' && (
                        <div className="p-4 space-y-2">
                             {evidenceBank.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-12 text-slate-400 gap-3">
                                  <List size={32} className="opacity-20"/>
                                  <p className="text-xs italic max-w-[200px]">
                                    {viewMode === 'tutorial' 
                                       ? "Hover over the icons in the transcript to see examples."
                                       : "Highlight sentences in the transcript to add annotations."
                                     }
                                  </p>
                                </div>
                              ) : (
                                evidenceBank.map((log, i) => (
                                    <div 
                                      key={log.id} 
                                      onClick={(e) => handleEditLog(log, e)}
                                      className="flex flex-col gap-1 p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md cursor-pointer transition-all group relative"
                                    >
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                          <button 
                                            onClick={(e) => handleEditLog(log, e)}
                                            className="p-1 bg-slate-100 rounded hover:bg-blue-100 transition-colors"
                                            title="Edit"
                                          >
                                            <Edit2 size={10} className="text-slate-500 hover:text-blue-600"/>
                                          </button>
                                          <button 
                                            onClick={(e) => handleDeleteLog(log.id, e)}
                                            className="p-1 bg-slate-100 rounded hover:bg-red-100 transition-colors"
                                            title="Delete"
                                          >
                                            <Trash2 size={10} className="text-slate-500 hover:text-red-600"/>
                                          </button>
                                        </div>
                                        <div className="flex justify-between items-start pr-6">
                                          <div className="flex flex-col gap-1 mb-1">
                                            <div className="flex items-center gap-2">
                                              <div className="min-w-[16px] h-4 rounded bg-slate-100 text-slate-600 text-[9px] flex items-center justify-center font-bold border border-slate-200">{i + 1}</div>
                                              <div className="flex gap-1 flex-wrap">
                                                  {log.selectedNorms.map((norm, nIdx) => (
                                                      <span key={nIdx} className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                                          {norm === "Other" && log.customNormText ? `Other: ${log.customNormText}` : (
                                                              META_NORMS.flatMap(g => g.options).find(o => o.desc === norm || o.label === norm)?.label || norm
                                                          )}
                                                      </span>
                                                  ))}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex gap-2 my-1">
                                          <div className="w-1 bg-blue-500 rounded-full flex-shrink-0" />
                                          <p className="text-xs text-slate-700 italic bg-slate-50 py-1.5 px-3 rounded flex-1 border border-slate-100">
                                            &quot;{log.textSnippet}&quot;
                                          </p>
                                        </div>
                                        {log.reflection && (
                                          <p className="text-xs text-slate-500 leading-snug pl-1"><span className="font-semibold text-slate-700">Reflection:</span> {log.reflection}</p>
                                        )}
                                    </div>
                                ))
                              )}
                        </div>
                    )}
                </div>
            </div>
            </>
        ) : (
            <div className="w-12 border-l border-slate-200 bg-white flex flex-col items-center py-4 gap-4 flex-shrink-0 z-20">
                 <button 
                    onClick={() => setIsRightCollapsed(false)}
                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all shadow-sm"
                    title="Open Side Panel"
                >
                    <PanelRightOpen size={18} />
                </button>
                <div className="flex-1 w-full flex items-center justify-center min-h-0">
                    <span className="[writing-mode:vertical-lr] whitespace-nowrap text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Context & Notes
                    </span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}