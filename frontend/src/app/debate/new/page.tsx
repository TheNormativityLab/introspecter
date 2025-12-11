"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Brain,
  User,
  PlayCircle,
  Plus,
  Trash2,
  ArrowLeft,
  Gavel,
  MessageSquare,
  Terminal,
  LayoutGrid,
  Bug,
  FileText,
  CheckCircle2,
  Clock
} from "lucide-react";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";

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
  const router = useRouter();
  
  const [formData, setFormData] = useState<DebateFormData>({
    experimentName: "",
    numQuestions: 1,
    numRounds: 3,
    seeds: [1],
    agents: [{ id: "agent1", name: "Agent 1", model: "gpt_4o_mini", enabled: true }],
    customQuestions: [],
    selectedDatasets: [],
  });

  const [isCreating, setIsCreating] = useState(false);
  const [createdDebateData, setCreatedDebateData] = useState<any>(null);
  const [showCustomQuestions, setShowCustomQuestions] = useState(false);
  const [showProgressMonitor, setShowProgressMonitor] = useState(false);

  const availableModels = ["gpt_4o_mini", "gpt_3_5_turbo", "mistral-7b", "llama_3_1_8B", "human-participant"];
  const availableDatasets = [
    { value: "gsm8k", label: "GSM8K (Math)" },
    { value: "mmlu", label: "MMLU (Knowledge)" },
    { value: "commonsense_qa", label: "CommonsenseQA" },
    { value: "custom", label: "Custom" },
  ];
  const MAX_QUESTIONS = 100;
  const MAX_ROUNDS = 3;

  const isQuestionsExceeded = () => formData.numQuestions > MAX_QUESTIONS;
  const isRoundsExceeded = () => formData.numRounds > MAX_ROUNDS;
  const getEnabledAgents = () => formData.agents.filter((agent) => agent.enabled);
  
  const getTotalQuestions = () => {
    const datasetCount = formData.selectedDatasets.filter((d) => d !== "custom").length;
    return (formData.numQuestions * datasetCount) + formData.customQuestions.filter(q => q.question.trim()).length;
  };

  const isFormValid = () => {
    const hasName = formData.experimentName.trim() !== "";
    const hasValidNumbers = formData.numQuestions > 0 && formData.numRounds > 0;
    const hasAgents = getEnabledAgents().length >= 1;
    const hasDatasets = formData.selectedDatasets.filter((d) => d !== "custom").length > 0 || formData.customQuestions.some((q) => q.question.trim() !== "");
    const hasSeed = formData.seeds.length > 0;
    return hasName && hasValidNumbers && hasAgents && hasDatasets && hasSeed && !isQuestionsExceeded() && !isRoundsExceeded();
  };

  const handleBackToDashboard = () => router.push('/dashboard');
  
  const addAgent = () => {
    if (formData.agents.length >= 3) return alert("Maximum of 3 agents allowed.");
    const newIndex = formData.agents.length + 1;
    const newAgent: AgentConfig = {
      id: `agent${Date.now()}`,
      name: `Agent ${newIndex}`,
      model: "gpt_4o_mini",
      enabled: true,
    };
    setFormData((prev) => ({ ...prev, agents: [...prev.agents, newAgent] }));
  };

  const removeAgent = (id: string) => {
    setFormData((prev) => {
        const remaining = prev.agents.filter((a) => a.id !== id);
        const renumbered = remaining.map((a, i) => ({...a, name: `Agent ${i + 1}`}));
        return { ...prev, agents: renumbered };
    });
  };

  const updateAgent = (index: number, updates: Partial<AgentConfig>) => {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.map((agent, i) => (i === index ? { ...agent, ...updates } : agent)),
    }));
  };

  const toggleDataset = (value: string) => {
    if (value === "custom") {
      setShowCustomQuestions((prev) => {
        const newState = !prev;
        if (newState && formData.customQuestions.length === 0) {
          setFormData((prev) => ({ ...prev, customQuestions: [{ question: "", correctAnswer: "" }] }));
        }
        if (!newState) {
          setFormData((prev) => ({ ...prev, customQuestions: [] }));
        }
        return newState;
      });
    }
    setFormData((prev) => ({
      ...prev,
      selectedDatasets: prev.selectedDatasets.includes(value)
        ? prev.selectedDatasets.filter((d) => d !== value)
        : [...prev.selectedDatasets, value],
    }));
  };

  const handleCreateDebate = async () => {
    setIsCreating(true);
    try {
      const debateData = {
        experimentName: formData.experimentName,
        totalQuestions: getTotalQuestions(),
        numRounds: formData.numRounds,
        seeds: formData.seeds,
        agents: getEnabledAgents(),
        selectedDatasets: formData.selectedDatasets.filter((d) => d !== "custom"),
        customQuestions: formData.customQuestions.filter((q) => q.question.trim()),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setCreatedDebateData(debateData);
      setShowProgressMonitor(true);
    } catch (error) {
      console.error(error);
      alert("Failed to prepare debate.");
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
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-md cursor-pointer" onClick={() => router.push('/dashboard')}>
           <ArrowLeft size={20} />
        </button>

        <nav className="flex flex-col gap-3 w-full px-2">
          
          <button className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group">
            <LayoutGrid size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Dashboard
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate-annotation')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <FileText size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Debate Annotation
            </span>
          </button>
          
          <button 
            onClick={() => router.push('/argumentative-debate')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <Gavel size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Argumentative Debate
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate/new')} 
            className="p-3 rounded-xl bg-blue-50 text-blue-600 transition-colors relative group"
          >
            <MessageSquare size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Basic Debate
            </span>
          </button>

          <button 
            onClick={() => router.push('/debate/debug')} 
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
          >
            <Bug size={20} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Debug
            </span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc] overflow-hidden">
        <header className="px-8 py-5 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex-shrink-0">
            <div>
                <h1 className="text-xl font-bold text-slate-900">Create New Debate</h1>
                <p className="text-sm text-slate-500 mt-0.5">Set up a new experiment with AI agents or human participants.</p>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-8 pb-20">                
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                        <Settings size={18} className="text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Basic Configuration</h2>
                    </div>
                    <div className="p-6 grid gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Experiment Name</label>
                            <input 
                                type="text" 
                                value={formData.experimentName}
                                onChange={(e) => setFormData(prev => ({...prev, experimentName: e.target.value}))}
                                placeholder="e.g. GPT-4 vs Llama-3 Reasoning Test"
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm placeholder-gray-400"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Questions per Dataset</label>
                                <input 
                                    type="number" min="1" max={MAX_QUESTIONS}
                                    value={formData.numQuestions}
                                    onChange={(e) => setFormData(prev => ({...prev, numQuestions: parseInt(e.target.value) || 1}))}
                                    className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 outline-none transition-all text-sm ${isQuestionsExceeded() ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rounds per Question</label>
                                <input 
                                    type="number" min="1" max={MAX_ROUNDS}
                                    value={formData.numRounds}
                                    onChange={(e) => setFormData(prev => ({...prev, numRounds: parseInt(e.target.value) || 1}))}
                                    className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 outline-none transition-all text-sm ${isRoundsExceeded() ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Random Seed</label>
                            <div className="flex gap-2 flex-wrap">
                                {[0, 1, 2, 3, 4].map(seed => (
                                    <label key={seed} className={`flex items-center justify-center w-10 h-10 rounded-lg border cursor-pointer transition-all ${
                                        formData.seeds.includes(seed) 
                                        ? 'bg-slate-800 text-white border-slate-800 font-bold shadow-md scale-105' 
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}>
                                        <input 
                                            type="radio" 
                                            name="randomSeed"
                                            className="hidden" 
                                            checked={formData.seeds.includes(seed)}
                                            onChange={() => {
                                                // REPLACED: Logic to only allow one seed at a time
                                                setFormData(prev => ({...prev, seeds: [seed]}));
                                            }}
                                        />
                                        {seed}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Brain size={18} className="text-slate-400" />
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Configure Agents</h2>
                        </div>
                        <button 
                            onClick={addAgent}
                            disabled={formData.agents.length >= 3}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={14} /> Add Agent
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        {formData.agents.map((agent, idx) => (
                            <div key={agent.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${agent.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                <div className="flex items-center gap-4 flex-1">
                                    <input 
                                        type="checkbox" 
                                        checked={agent.enabled}
                                        onChange={(e) => updateAgent(idx, { enabled: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                                    />
                                    <div className="w-24 text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                                            {idx + 1}
                                        </div>
                                        {agent.name}
                                    </div>
                                    
                                    <div className="flex-1">
                                        <select 
                                            value={agent.model}
                                            onChange={(e) => updateAgent(idx, { model: e.target.value, isHuman: e.target.value === 'human-participant' })}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none bg-white"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m} value={m}>{m === 'human-participant' ? 'Human Participant' : m}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {formData.agents.length > 1 && (
                                    <button onClick={() => removeAgent(agent.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                        <FileText size={18} className="text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Datasets</h2>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {availableDatasets.map(ds => (
                                <label key={ds.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                    formData.selectedDatasets.includes(ds.value) 
                                    ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0"
                                        checked={formData.selectedDatasets.includes(ds.value)}
                                        onChange={() => toggleDataset(ds.value)}
                                    />
                                    <div className="flex-1 text-sm font-medium text-slate-700">{ds.label}</div>
                                </label>
                            ))}
                        </div>
                        
                        {showCustomQuestions && formData.selectedDatasets.includes("custom") && (
                            <div className="mt-6 pt-6 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700 text-sm">Custom Questions</h3>
                                    <button onClick={() => setFormData(p => ({...p, customQuestions: [...p.customQuestions, {question:"", correctAnswer:""}]}))} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                        <Plus size={14} /> Add
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {formData.customQuestions.map((q, i) => (
                                        <div key={i} className="flex gap-2">
                                            <input type="text" placeholder="Question" className="flex-1 px-3 py-2 border rounded text-sm" value={q.question} onChange={e => {
                                                const newQ = [...formData.customQuestions]; newQ[i].question = e.target.value; setFormData({...formData, customQuestions: newQ});
                                            }} />
                                            <input type="text" placeholder="Answer" className="w-1/3 px-3 py-2 border rounded text-sm" value={q.correctAnswer} onChange={e => {
                                                const newQ = [...formData.customQuestions]; newQ[i].correctAnswer = e.target.value; setFormData({...formData, customQuestions: newQ});
                                            }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleCreateDebate}
                        disabled={isCreating || !isFormValid()}
                        className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20 transition-all cursor-pointer"
                    >
                        {isCreating ? <Clock className="animate-spin" size={18} /> : <PlayCircle className="fill-current" size={18} />}
                        {isCreating ? "Creating..." : "Start Experiment"}
                    </button>
                </div>

            </div>
        </div>
      </main>
    </div>
  );
}