"use client"
import React, { useState, useEffect, useRef, JSX } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChartRenderer } from '@/components/charts/ChartRenderer';
import { useConversationStore } from '@/hooks/useConversation';
import {
  Send,
  Loader2,
  Bot,
  User,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
  CheckSquare,
  Square,
  RefreshCw,
  Filter,
  Trash2,
  Plus,
  MessageSquare,
  Clock,
  AlertCircle,
} from "lucide-react";

interface DebateRun {
  id: number;
  type: 'debate';
  name: string;
  experimentId: string;
  dataset: string;
  models: string[];
  status: string;
  numRounds: number;
  numDebates: number;
  debateIds: number[];
  createdAt: string;
}

interface ArgumentativeRun {
  id: string;
  type: 'argumentative';
  name: string;
  debaterModel: string;
  judgeModel: string;
  numRounds: number;
  numQuestions: number;
  createdAt: string;
}

interface PlotData {
  id?: string;
  type: string;
  title: string;
  data: any;
  rawData?: any;
  url?: string;
  renderType?: string;
}

interface ConversationPreview {
  id: string;
  preview: string;
  messageCount: number;
  plotCount?: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  plotId?: string;
  id?: string;
  hasPlot?: boolean;
}

function formatAnalysisText(text: string): JSX.Element[] {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType === 'ul' ? 'ul' : 'ol';
      elements.push(
        <ListTag
          key={elements.length}
          className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} list-inside space-y-1 my-2 text-slate-600 ml-2`}
        >
          {listItems.map((item, i) => (
            <li key={i}>{formatInlineText(item)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const formatInlineText = (text: string): JSX.Element => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
      const codeMatch = remaining.match(/`(.+?)`/);

      const candidates = [
        boldMatch ? { match: boldMatch, type: 'bold' as const, index: boldMatch.index! } : null,
        italicMatch ? { match: italicMatch, type: 'italic' as const, index: italicMatch.index! } : null,
        codeMatch ? { match: codeMatch, type: 'code' as const, index: codeMatch.index! } : null,
      ]
        .filter(Boolean)
        .sort((a, b) => a!.index - b!.index);

      if (candidates.length === 0 || candidates[0]!.index > 0) {
        const textEnd = candidates.length > 0 ? candidates[0]!.index : remaining.length;
        parts.push(remaining.substring(0, textEnd));
        remaining = remaining.substring(textEnd);
        continue;
      }

      const first = candidates[0]!;
      if (first.type === 'bold') {
        parts.push(
          <strong key={key++} className="font-semibold text-slate-900">
            {first.match![1]}
          </strong>
        );
      } else if (first.type === 'italic') {
        parts.push(
          <em key={key++} className="text-slate-600">
            {first.match![1]}
          </em>
        );
      } else {
        parts.push(
          <code key={key++} className="bg-slate-100 px-1.5 py-0.5 rounded text-sm text-slate-800 font-mono">
            {first.match![1]}
          </code>
        );
      }
      remaining = remaining.substring(first.match![0].length);
    }

    return <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={elements.length} className="text-xs font-semibold text-slate-600 mt-2 mb-0.5 uppercase tracking-wide">
          {trimmed.slice(5)}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={elements.length} className="text-sm font-semibold text-slate-700 mt-3 mb-1">
          {trimmed.slice(4)}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={elements.length} className="text-base font-semibold text-slate-800 mt-4 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={elements.length} className="text-lg font-bold text-slate-900 mt-4 mb-2">
          {trimmed.slice(2)}
        </h1>
      );
      continue;
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList();
      elements.push(<hr key={elements.length} className="border-slate-200 my-3" />);
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(trimmed.slice(2));
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(numberedMatch[2]);
      continue;
    }

    flushList();
    elements.push(
      <p key={elements.length} className="text-slate-700 my-1.5 leading-relaxed">
        {formatInlineText(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

function ChevronLeft({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const API_BASE_URL = '';

export default function HarnessPage() {
  const {
    conversationId,
    messages,
    plots,
    isLoading: isConversationLoading,
    setMessages,
    addMessage,
    addPlot,
    startNewConversation,
    clearConversation,
    loadConversation,
    getOrCreateConversationId
  } = useConversationStore();

  const [debates, setDebates] = useState<DebateRun[]>([]);
  const [argumentativeRuns, setArgumentativeRuns] = useState<ArgumentativeRun[]>([]);
  const [selectedDebates, setSelectedDebates] = useState<Set<string>>(new Set());
  const [selectedArgumentative, setSelectedArgumentative] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [showRunSelector, setShowRunSelector] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [hiddenPlots, setHiddenPlots] = useState<Set<string>>(new Set());
  const [activeDebateIds, setActiveDebateIds] = useState<number[]>([]);
  const [activeArgumentativeIds, setActiveArgumentativeIds] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialized) {
      startNewConversation();
      setActiveDebateIds([]);
      setActiveArgumentativeIds([]);
      setInitialized(true);
    }
    loadRuns();
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 56), 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/harness/conversations`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const handleLoadConversation = async (convId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/harness/conversations/${convId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.debateIds && data.debateIds.length > 0) {
          setActiveDebateIds(data.debateIds);
        }
        if (data.argumentativeIds && data.argumentativeIds.length > 0) {
          setActiveArgumentativeIds(data.argumentativeIds);
        }
      }
    } catch (err) {
      console.error('Failed to load conversation metadata:', err);
    }
    
    await loadConversation(convId);
    setShowConversationHistory(false);
    loadConversations();
  };

  const handleNewConversation = () => {
    startNewConversation();
    setActiveDebateIds([]);
    setActiveArgumentativeIds([]);
    loadConversations();
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/harness/conversations/${convId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (convId === conversationId) {
          startNewConversation();
          setActiveDebateIds([]);
          setActiveArgumentativeIds([]);
        }
        loadConversations();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const loadRuns = async () => {
    setIsLoadingRuns(true);
    setError(null);
    try {
      let response = await fetch(`${API_BASE_URL}/api/harness/runs`);
      if (!response.ok) response = await fetch(`${API_BASE_URL}/api/all-debates`);
      if (!response.ok) throw new Error(`Failed to fetch runs: ${response.status}`);

      const data = await response.json();

      if (data.debates && Array.isArray(data.debates)) {
        setDebates(data.debates);
      } else if (data.experiment_groups) {
        const transformed = data.experiment_groups
          .filter((g: any) => g.runs?.some((r: any) => r.status === 'completed'))
          .map((g: any, i: number) => ({
            id: i,
            type: 'debate' as const,
            name: g.experiment_name,
            experimentId: g.experiment_name,
            dataset: g.dataset_name?.join(', ') || 'Unknown',
            models: g.model_config?.LLM?.map((m: any) => m.model) || [],
            status: `${g.completed_runs}/${g.total_runs}`,
            numRounds: 0,
            numDebates: g.runs.length,
            debateIds: g.runs
              .filter((r: any) => r.status === 'completed' && r.debate_id)
              .map((r: any) => r.debate_id),
            createdAt: g.runs[0]?.processed_at || new Date().toISOString(),
          }));
        setDebates(transformed);
      }

      if (data.argumentativeRuns) setArgumentativeRuns(data.argumentativeRuns);
    } catch (err: any) {
      console.error('Failed to load runs:', err);
      setError(err.message);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const toggleDebate = (name: string) =>
    setSelectedDebates(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleArgumentative = (id: string) =>
    setSelectedArgumentative(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getSelectedDebateIds = (): number[] => {
    const ids: number[] = [];
    for (const name of selectedDebates) {
      const debate = debates.find(d => d.name === name);
      if (debate?.debateIds) ids.push(...debate.debateIds);
    }
    return ids;
  };

  const getSelectedArgumentativeIds = (): string[] => Array.from(selectedArgumentative);

  const totalSelected = selectedDebates.size + selectedArgumentative.size;
  const totalDebateIds = getSelectedDebateIds().length;

  const hasActiveConversation = messages.length > 0 && activeDebateIds.length > 0;
  const effectiveDebateCount = hasActiveConversation ? activeDebateIds.length : totalDebateIds;
  const canSubmit = hasActiveConversation || totalSelected > 0;

  const filteredDebates = debates.filter(
    d =>
      !filterText ||
      d.name.toLowerCase().includes(filterText.toLowerCase()) ||
      d.dataset?.toLowerCase().includes(filterText.toLowerCase()) ||
      d.experimentId?.toLowerCase().includes(filterText.toLowerCase())
  );

  const filteredArgumentative = argumentativeRuns.filter(
    r =>
      !filterText ||
      r.name.toLowerCase().includes(filterText.toLowerCase()) ||
      r.debaterModel?.toLowerCase().includes(filterText.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const debateIds = isFirstMessage ? getSelectedDebateIds() : activeDebateIds;
    const argumentativeIds = isFirstMessage ? getSelectedArgumentativeIds() : activeArgumentativeIds;

    if (isFirstMessage && debateIds.length === 0 && argumentativeIds.length === 0) {
      alert('Please select at least one experiment to analyze');
      return;
    }

    if (!isFirstMessage && debateIds.length === 0 && argumentativeIds.length === 0) {
      alert('No experiments associated with this conversation. Please start a new conversation.');
      return;
    }

    setIsLoading(true);
    const queryText = input.trim();
    setInput("");

    const userMessage: Message = {
      role: 'user',
      content: queryText,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);

    try {
      const currentConversationId = await getOrCreateConversationId();

      const res = await fetch(`/api/harness/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          debateIds: isFirstMessage ? debateIds : undefined, 
          argumentativeIds: isFirstMessage ? argumentativeIds : undefined, 
          query: queryText,
          conversationId: currentConversationId,
        }),
      });

      if (!res.ok) {
        let errBody;
        try { errBody = await res.json(); } catch { errBody = await res.text(); }
        throw new Error(typeof errBody === 'string' ? errBody : JSON.stringify(errBody));
      }

      const analysis = await res.json();

      if (analysis.data?.debateIds) {
        setActiveDebateIds(analysis.data.debateIds);
      }
      if (analysis.data?.argumentativeIds) {
        setActiveArgumentativeIds(analysis.data.argumentativeIds);
      }

      if (analysis.plot) {
        addPlot({
          id: analysis.plot.id,
          type: analysis.plot.type,
          title: analysis.plot.title,
          data: analysis.plot.data,
          rawData: analysis.plot.rawData,
          renderType: analysis.plot.renderType,
          createdAt: new Date().toISOString(),
          messageIndex: messages.length + 1,
        });
      }

      addMessage({
        role: 'assistant',
        content: analysis.summary || analysis.result || 'Analysis complete.',
        timestamp: new Date().toISOString(),
        plotId: analysis.plot?.id,
      });

    } catch (err: any) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    await clearConversation();
    setHiddenPlots(new Set());
    setActiveDebateIds([]);
    setActiveArgumentativeIds([]);
    loadConversations();
  };

  const selectAllDebates = () => {
    if (selectedDebates.size === filteredDebates.length) {
      setSelectedDebates(new Set());
    } else {
      setSelectedDebates(new Set(filteredDebates.map(d => d.name)));
    }
  };

  const togglePlotVisibility = (plotId: string) => {
    setHiddenPlots(prev => {
      const next = new Set(prev);
      if (next.has(plotId)) {
        next.delete(plotId);
      } else {
        next.add(plotId);
      }
      return next;
    });
  };

  const getPlotForMessage = (plotId?: string): PlotData | undefined => {
    if (!plotId) return undefined;
    return plots.find(p => p.id === plotId);
  };

  const renderPlot = (plotId: string | undefined, messageIndex: number) => {
    if (!plotId) {
      return null;
    }
    
    const plot = plots.find(p => p.id === plotId);
    
    if (!plot) {
      return null;
    }

    const isHidden = hiddenPlots.has(plotId);

    if (isHidden) {
      return (
        <button
          onClick={() => togglePlotVisibility(plotId)}
          className="mt-3 flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
        >
          <BarChart3 size={16} />
          Show visualization ({plot.type})
        </button>
      );
    }

    return (
      <div className="mt-4">
        <ChartRenderer 
          chart={plot as any} 
          onClose={() => togglePlotVisibility(plotId)} 
        />
      </div>
    );
  };

  const renderMessage = (message: any, index: number) => {
    const isUser = message.role === 'user';
    const messageId = message.id || `msg_${index}`;
    
    return (
      <div key={messageId} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isUser ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>
        <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
          <div
            className={`inline-block text-left ${
              isUser
                ? 'bg-blue-500 text-white rounded-2xl rounded-br-md p-4'
                : 'bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-sm'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="p-4">
                <div className="max-w-none">{formatAnalysisText(message.content)}</div>
                {message.plotId && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {renderPlot(message.plotId, index)}
                  </div>
                )}
                {!message.plotId && message.hasPlot && (
                  <div className="mt-3 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                    ⚠️ Plot data available but not linked
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`text-[10px] text-slate-400 mt-1 ${isUser ? 'text-right' : ''}`}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getActiveExperimentNames = (): string[] => {
    if (activeDebateIds.length === 0) return [];
    const names: string[] = [];
    for (const debate of debates) {
      const hasMatch = debate.debateIds.some(id => activeDebateIds.includes(id));
      if (hasMatch && !names.includes(debate.name)) {
        names.push(debate.name);
      }
    }
    return names;
  };

  const suggestedQueries = [
    "Show accuracy by round",
    "Compare performance across experiments",
    "How does accuracy change over time?",
    "What is the consensus rate per round?",
    "Show answer flow diagram",
  ];

  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex min-w-0">
        <div
          className={`${
            showRunSelector ? 'w-80' : 'w-0'
          } transition-all duration-300 border-r border-slate-200 bg-white flex flex-col overflow-hidden`}
        >
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setShowConversationHistory(false)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                !showConversationHistory
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Database size={16} className="inline mr-2" />
              Experiments
            </button>
            <button
              onClick={() => setShowConversationHistory(true)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                showConversationHistory
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <MessageSquare size={16} className="inline mr-2" />
              History
            </button>
          </div>

          {showConversationHistory ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <button
                  onClick={handleNewConversation}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  New Conversation
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {isLoadingConversations ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" />
                    Loading conversations…
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No conversations yet
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => handleLoadConversation(conv.id)}
                        className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                          conv.id === conversationId
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {conv.preview}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              <Clock size={12} />
                              <span>{formatRelativeTime(conv.updatedAt)}</span>
                              <span>•</span>
                              <span>{conv.messageCount} messages</span>
                              {conv.plotCount && conv.plotCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{conv.plotCount} charts</span>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => deleteConversation(conv.id, e)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
                            title="Delete conversation"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Database size={18} className="text-blue-500" />
                    Experiments
                  </h2>
                  <button
                    onClick={loadRuns}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw
                      size={16}
                      className={`text-slate-500 ${isLoadingRuns ? 'animate-spin' : ''}`}
                    />
                  </button>
                </div>
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter experiments..."
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {hasActiveConversation && (
                  <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle size={14} />
                      Active conversation
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      Analyzing {activeDebateIds.length} debate runs
                    </div>
                    <button
                      onClick={handleNewConversation}
                      className="mt-2 text-xs text-green-700 hover:text-green-800 underline"
                    >
                      Start new to change selection
                    </button>
                  </div>
                )}
                {!hasActiveConversation && totalSelected > 0 && (
                  <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                    {totalSelected} experiment{totalSelected !== 1 ? 's' : ''} selected
                    <span className="text-blue-500 text-xs block">({totalDebateIds} debate runs)</span>
                  </div>
                )}
                {error && (
                  <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700">{error}</div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredDebates.length > 0 && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Experiments ({filteredDebates.length})
                      </h3>
                      {!hasActiveConversation && (
                        <button onClick={selectAllDebates} className="text-xs text-blue-500 hover:text-blue-600">
                          {selectedDebates.size === filteredDebates.length ? 'Deselect all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {filteredDebates.map(debate => {
                        const isActiveInConversation = hasActiveConversation && 
                          debate.debateIds.some(id => activeDebateIds.includes(id));
                        const isSelected = selectedDebates.has(debate.name);
                        const isDisabled = hasActiveConversation && !isActiveInConversation;
                        
                        return (
                          <div key={debate.name}>
                            <div
                              onClick={() => !hasActiveConversation && toggleDebate(debate.name)}
                              className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                                isActiveInConversation
                                  ? 'bg-green-50 border border-green-200'
                                  : isSelected
                                  ? 'bg-blue-50 border border-blue-200 cursor-pointer'
                                  : isDisabled
                                  ? 'opacity-50 cursor-not-allowed border border-transparent'
                                  : 'hover:bg-slate-50 border border-transparent cursor-pointer'
                              }`}
                            >
                              <button
                                onClick={e => toggleExpand(debate.name, e)}
                                className="mt-0.5 p-0.5 hover:bg-slate-200 rounded"
                              >
                                {expandedItems.has(debate.name) ? (
                                  <ChevronDown size={14} className="text-slate-400" />
                                ) : (
                                  <ChevronRight size={14} className="text-slate-400" />
                                )}
                              </button>
                              <div className="mt-0.5">
                                {isActiveInConversation ? (
                                  <CheckSquare size={16} className="text-green-500" />
                                ) : isSelected ? (
                                  <CheckSquare size={16} className="text-blue-500" />
                                ) : (
                                  <Square size={16} className="text-slate-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div
                                  className="text-sm font-medium text-slate-700 truncate"
                                  title={debate.name}
                                >
                                  {debate.name}
                                  {isActiveInConversation && (
                                    <span className="ml-2 text-xs text-green-600">(active)</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                  <span>{debate.dataset || 'Unknown'}</span>
                                  <span>•</span>
                                  <span>{debate.status}</span>
                                  <span>•</span>
                                  <span>{debate.debateIds?.length || 0} runs</span>
                                </div>
                              </div>
                            </div>
                            {expandedItems.has(debate.name) && (
                              <div className="ml-8 mt-1 mb-2">
                                <div className="text-xs text-slate-500 px-2 py-1 bg-slate-50 rounded space-y-0.5">
                                  <div>
                                    <span className="font-medium">Name:</span> {debate.name}
                                  </div>
                                  <div>
                                    <span className="font-medium">Experiment ID:</span> {debate.experimentId}
                                  </div>
                                  <div>
                                    <span className="font-medium">Models:</span>{' '}
                                    {debate.models?.join(', ') || 'N/A'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Dataset:</span> {debate.dataset}
                                  </div>
                                  <div>
                                    <span className="font-medium">Rounds:</span> {debate.numRounds || 'N/A'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Debate IDs:</span>{' '}
                                    {debate.debateIds?.slice(0, 5).join(', ')}
                                    {(debate.debateIds?.length || 0) > 5 ? '…' : ''}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {filteredArgumentative.length > 0 && (
                  <div className="p-3 border-t border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Argumentative ({filteredArgumentative.length})
                    </h3>
                    <div className="space-y-1">
                      {filteredArgumentative.map(run => (
                        <div
                          key={run.id}
                          onClick={() => !hasActiveConversation && toggleArgumentative(run.id)}
                          className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                            selectedArgumentative.has(run.id)
                              ? 'bg-purple-50 border border-purple-200'
                              : hasActiveConversation
                              ? 'opacity-50 cursor-not-allowed border border-transparent'
                              : 'hover:bg-slate-50 border border-transparent cursor-pointer'
                          }`}
                        >
                          <div className="mt-0.5">
                            {selectedArgumentative.has(run.id) ? (
                              <CheckSquare size={16} className="text-purple-500" />
                            ) : (
                              <Square size={16} className="text-slate-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{run.name}</div>
                            <div className="text-xs text-slate-500">
                              {run.numQuestions} questions • {run.numRounds} rounds
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isLoadingRuns && (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" />
                    Loading experiments…
                  </div>
                )}
                {!isLoadingRuns && filteredDebates.length === 0 && filteredArgumentative.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm">No experiments found</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="px-6 py-4 flex justify-between items-center border-b border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRunSelector(!showRunSelector)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {showRunSelector ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Experiment Analysis</h1>
                <p className="text-sm text-slate-500">
                  {hasActiveConversation ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Analyzing {activeDebateIds.length} debate runs
                      {getActiveExperimentNames().length > 0 && (
                        <span className="text-slate-400">
                          ({getActiveExperimentNames().slice(0, 2).join(', ')}
                          {getActiveExperimentNames().length > 2 ? '…' : ''})
                        </span>
                      )}
                    </span>
                  ) : totalSelected > 0 ? (
                    `${totalSelected} experiment${totalSelected !== 1 ? 's' : ''} selected (${totalDebateIds} debate runs)`
                  ) : (
                    'Select experiments to analyze'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                  Clear
                </button>
              )}
              <button
                onClick={handleNewConversation}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Plus size={16} />
                New Chat
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl flex items-center justify-center mb-4">
                  <BarChart3 size={40} className="text-blue-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Analyze Your Experiments</h2>
                <p className="text-sm text-slate-500 max-w-md mb-6">
                  {totalSelected > 0
                    ? `Ready to analyze ${totalDebateIds} debate runs. Ask any question about the data.`
                    : 'Select experiments from the left panel, then ask questions about accuracy, consistency, model performance, and more.'}
                </p>
                {totalSelected > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                    {suggestedQueries.map(query => (
                      <button
                        key={query}
                        onClick={() => setInput(query)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => renderMessage(msg, idx))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100">
                      <Bot size={16} className="text-slate-600" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 size={14} className="animate-spin text-blue-500" />
                        Analyzing your data…
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-slate-200 bg-white">
            {activeDebateIds.length > 0 && messages.length > 0 && (
              <div className="text-xs text-slate-500 mb-2 flex items-center justify-between">
                <span>
                  Analyzing {activeDebateIds.length} debate run{activeDebateIds.length !== 1 ? 's' : ''}
                  {getActiveExperimentNames().length > 0 && (
                    <span className="text-slate-400 ml-1">
                      from {getActiveExperimentNames().slice(0, 3).join(', ')}
                      {getActiveExperimentNames().length > 3 ? '…' : ''}
                    </span>
                  )}
                </span>
                <button 
                  onClick={handleNewConversation}
                  className="text-blue-500 hover:text-blue-600 hover:underline"
                >
                  Change selection
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                      }
                    }}
                    placeholder={
                      canSubmit
                        ? 'Ask about accuracy, consensus, model performance…'
                        : 'Select experiments first…'
                    }
                    disabled={isLoading || !canSubmit}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-50 transition-all text-base leading-relaxed overflow-hidden"
                    style={{ 
                      minHeight: '56px', 
                      maxHeight: '200px',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim() || !canSubmit}
                  className="w-12 h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}