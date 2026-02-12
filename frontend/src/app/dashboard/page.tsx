"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useMemo } from "react";
import { transformExperiment } from "@/utils/helper";
import { Button } from "@/components/button/Button";
import {
  FileText,
  Clock,
  CheckCircle,
  Filter,
  Search,
  X,
  Users,
  MessageSquare,
  Activity,
  LayoutGrid,
  Database,
  Bot,
  Bug,
  ArrowRight,
  Gavel
} from "lucide-react";

interface Experiment {
  id: string;
  name: string;
  datasets: string[];
  agents: string[];
  status: "completed" | "in-progress";
  endDate: string;
  startDate: string;
  numAgents: number;
  numRounds: number;
  numQuestions: number;
  hasHuman: boolean;
  availableSeeds: string[];
  selectedSeed: string;
  performance: {
    majority_vote: number;
    rounds_completed: number;
  };
  rawData: any;
}

interface FilterState {
  searchTerm: string;
  status: string;
  selectedAgents: string[];
  selectedDatasets: string[];
  participationTypes: string[];
  numRounds: number;
  numAgents: number;
}

const Dashboard = () => {
  const router = useRouter();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const availableAgents = ["llama-3.1-8b-chat", "mistral-7b", "gpt-4o-mini", "gpt_3.5_turbo", "human-participant"];
  const availableDatasets = ["gsm8k", "mmlu", "commonsense_qa", "custom"];

  const getInitialFilters = (): FilterState => ({
    searchTerm: "",
    status: "all",
    selectedAgents: [],
    selectedDatasets: [],
    participationTypes: [],
    numRounds: 0,
    numAgents: 0,
  });

  const [filters, setFilters] = useState<FilterState>(getInitialFilters);

  useEffect(() => {
    fetchExperiments();
  }, []);

  const fetchExperiments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/all-debates`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log(data)
      if (data.experiment_groups && Array.isArray(data.experiment_groups)) {
        const transformedExperiments = data.experiment_groups.map(transformExperiment);
        setExperiments(transformedExperiments);
      } else {
        setExperiments([]);
      }
    } catch (err) {
      setError("Failed to load experiments");
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  };

  const getActualNumRounds = (experiment: Experiment): number => {
    if (experiment.rawData?.runs && Array.isArray(experiment.rawData.runs)) {
      const firstRun = experiment.rawData.runs[0];
      if (firstRun?.result_data?.[0]?.debate_session?.rounds) return firstRun.result_data[0].debate_session.rounds.length;
      const parsedArgs = firstRun?.wandb_metadata?.parsed_args || {};
      return parsedArgs["checkpoint.frequency"] ? (parsedArgs["experiment.num_rounds"] || 0) + 1 : (parsedArgs["experiment.num_rounds"] || 0);
    }
    if (experiment.rawData?.result_data?.[0]?.debate_session?.rounds) return experiment.rawData.result_data[0].debate_session.rounds.length;
    const parsedArgs = experiment.rawData?.wandb_metadata?.parsed_args || {};
    return parsedArgs["checkpoint.frequency"] ? (parsedArgs["experiment.num_rounds"] || 0) + 1 : (parsedArgs["experiment.num_rounds"] || 0);
  };

  const getActualNumAgents = (experiment: Experiment): number => {
    if (experiment.rawData?.runs && Array.isArray(experiment.rawData.runs)) {
      const firstRun = experiment.rawData.runs[0];
      if (firstRun?.result_data?.[0]?.debate_session?.rounds?.[0]?.responses) return Object.keys(firstRun.result_data[0].debate_session.rounds[0].responses).length;
    }
    if (experiment.rawData?.result_data?.[0]?.debate_session?.rounds?.[0]?.responses) return Object.keys(experiment.rawData.result_data[0].debate_session.rounds[0].responses).length;
    return experiment.agents?.length || 0;
  };

  const getDatasetDisplayName = (dataset: string) => {
    const displayNames: Record<string, string> = { custom: "Custom Questions", gsm8k: "GSM8K", mmlu: "MMLU", commonsense_qa: "CommonsenseQA" };
    return displayNames[dataset.toLowerCase()] || dataset;
  };

  const handleSeedChange = (experimentId: string, newSeed: string) => {
    setExperiments((prev) => prev.map((exp) => exp.id === experimentId ? { ...exp, selectedSeed: newSeed } : exp));
  };

  const toggleFilter = (category: keyof FilterState, value: string) => {
    setFilters(prev => {
        const current = prev[category] as string[];
        const updated = current.includes(value) ? current.filter(i => i !== value) : [...current, value];
        return { ...prev, [category]: updated };
    });
  };

  const filteredExperiments = useMemo(() => {
    return experiments.filter((exp) => {
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const matches = exp.name.toLowerCase().includes(term) || 
                        exp.datasets.some(d => d.toLowerCase().includes(term)) || 
                        exp.agents.some(a => a.toLowerCase().includes(term));
        if (!matches) return false;
      }
      if (filters.status !== "all" && exp.status !== filters.status) return false;
      
      if (filters.selectedDatasets.length > 0) {
        const hasDataset = exp.datasets?.some(d => filters.selectedDatasets.some(sd => d.toLowerCase().includes(sd.toLowerCase().replace('custom_questions','custom'))));
        if (!hasDataset) return false;
      }

      if (filters.selectedAgents.length > 0) {
        const expAgents = [...exp.agents, exp.hasHuman ? "human" : ""].map(a => a.toLowerCase().replace(/[-_]/g, ""));
        const hasMatch = filters.selectedAgents.some(sa => expAgents.some(ea => ea.includes(sa.toLowerCase().replace(/[-_]/g, ""))));
        if (!hasMatch) return false;
      }

      if (filters.participationTypes.length > 0) {
         const isHuman = filters.participationTypes.includes("With Human") && exp.hasHuman;
         const isAI = filters.participationTypes.includes("AI Only") && !exp.hasHuman;
         if (!isHuman && !isAI) return false;
      }
      return true;
    });
  }, [experiments, filters]);


  return (
    <div className="flex h-screen w-full bg-[#f8f9fc] text-slate-800 font-sans overflow-hidden">
      <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div 
          className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-2 shadow-lg shadow-slate-200 cursor-pointer"
          onClick={() => router.push('/')}
        >
          <LayoutGrid size={20} />
        </div>

        <nav className="flex flex-col gap-3 w-full px-2">
          
          <button className="p-3 rounded-xl bg-blue-50 text-blue-600 transition-colors relative group">
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
            className="p-3 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors relative group"
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

      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-200 flex-col overflow-hidden flex-shrink-0">
        <div className="p-6 border-b border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Filter size={12} /> Filters
            </h2>
            <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                <input 
                    type="text" 
                    placeholder="Search experiments..." 
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-transparent hover:bg-slate-100 focus:bg-white focus:border-blue-500 rounded-lg text-sm transition-all outline-none"
                />
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div>
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wide">Datasets</h3>
                <div className="space-y-2">
                    {availableDatasets.map(ds => (
                         <label key={ds} className="flex items-center gap-3 cursor-pointer group">
                             <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${filters.selectedDatasets.includes(ds) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white group-hover:border-blue-400'}`}>
                                 {filters.selectedDatasets.includes(ds) && <CheckCircle size={10} />}
                             </div>
                             <input type="checkbox" className="hidden" checked={filters.selectedDatasets.includes(ds)} onChange={() => toggleFilter('selectedDatasets', ds)} />
                             <span className={`text-sm transition-colors ${filters.selectedDatasets.includes(ds) ? 'text-slate-900 font-medium' : 'text-slate-600 group-hover:text-slate-900'}`}>{getDatasetDisplayName(ds)}</span>
                         </label>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wide">Agents</h3>
                <div className="space-y-2">
                    {availableAgents.map(agent => (
                         <label key={agent} className="flex items-center gap-3 cursor-pointer group">
                             <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${filters.selectedAgents.includes(agent) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white group-hover:border-blue-400'}`}>
                                 {filters.selectedAgents.includes(agent) && <CheckCircle size={10} />}
                             </div>
                             <input type="checkbox" className="hidden" checked={filters.selectedAgents.includes(agent)} onChange={() => toggleFilter('selectedAgents', agent)} />
                             <span className={`text-sm truncate transition-colors ${filters.selectedAgents.includes(agent) ? 'text-slate-900 font-medium' : 'text-slate-600 group-hover:text-slate-900'}`} title={agent}>{agent}</span>
                         </label>
                    ))}
                </div>
            </div>
            
            <button onClick={() => setFilters(getInitialFilters())} className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 font-medium transition-all">
                <X size={12} /> Clear all filters
            </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9fc]">
        
        <header className="px-8 py-6 flex justify-between items-center sticky top-0 z-10 bg-[#f8f9fc]/90 backdrop-blur-sm">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Experiments</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Showing {filteredExperiments.length} run{filteredExperiments.length !== 1 && 's'}
                </p>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
             {loading ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-400">
                     <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin mb-4" />
                     <p>Loading experiments...</p>
                 </div>
             ) : filteredExperiments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                    <Bot size={48} className="mb-4 text-slate-200" />
                    <p>No experiments found matching your filters.</p>
                </div>
             ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-12">
                    {filteredExperiments.map(experiment => (
                        <div 
                            key={experiment.id} 
                            onClick={() => router.push(`/debate/${experiment.id}?seed=${experiment.selectedSeed}`)}
                            className="group bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:border-blue-200 transition-all duration-300 flex flex-col cursor-pointer overflow-hidden"
                        >
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-slate-900 text-lg line-clamp-1 pr-4 group-hover:text-blue-600 transition-colors">
                                            {experiment.name}
                                    </h3>
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                        <Clock size={10} /> {new Date(experiment.startDate).toLocaleDateString()}
                                    </span>
                                </div>

                                <div className="mb-5 flex gap-2">
                                     <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                         experiment.status === "completed" 
                                           ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                           : "bg-amber-50 text-amber-700 border-amber-100"
                                     }`}>
                                         {experiment.status === "completed" ? <CheckCircle size={10} /> : <Activity size={10} />}
                                         {experiment.status}
                                     </span>
                                     {experiment.hasHuman && (
                                       <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                         <Users size={10} /> Human
                                       </span>
                                     )}
                                </div>

                                <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/50 rounded-xl border border-slate-100 mb-5">
                                     <div className="py-3 px-2 flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Rounds</span>
                                        <span className="text-sm font-bold text-slate-700">{getActualNumRounds(experiment)}</span>
                                     </div>
                                     <div className="py-3 px-2 flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Agents</span>
                                        <span className="text-sm font-bold text-slate-700">{getActualNumAgents(experiment)}</span>
                                     </div>
                                     <div className="py-3 px-2 flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Questions</span>
                                        <span className="text-sm font-bold text-slate-700">{experiment.numQuestions}</span>
                                     </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-5 h-5 rounded bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                                            <Database size={12} />
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {experiment.datasets.map(d => (
                                                <span key={d} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[11px] font-medium shadow-sm">
                                                    {getDatasetDisplayName(d)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                         <div className="mt-1 w-5 h-5 rounded bg-purple-50 text-purple-500 flex items-center justify-center flex-shrink-0">
                                            <Bot size={12} />
                                         </div>
                                         <div className="flex flex-wrap gap-1.5">
                                             {experiment.agents.slice(0, 3).map(a => (
                                                 <span key={a} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[11px] font-medium shadow-sm">
                                                     {a}
                                                 </span>
                                             ))}
                                             {experiment.agents.length > 3 && (
                                                 <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-100 text-[11px] font-medium">+{experiment.agents.length - 3}</span>
                                             )}
                                         </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto bg-slate-50/50 border-t border-slate-100 p-4 flex items-center justify-between group-hover:bg-blue-50/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seed</span>
                                    {/* Changed from overflow-x-auto to flex-wrap to remove scrollbar */}
                                    <div className="flex gap-1 flex-wrap">
                                        {experiment.availableSeeds.map(seed => (
                                            <button 
                                                key={seed}
                                                onClick={(e) => { e.stopPropagation(); handleSeedChange(experiment.id, seed); }}
                                                className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold font-mono transition-all flex-shrink-0 ${
                                                    seed === experiment.selectedSeed 
                                                    ? 'bg-slate-800 text-white shadow-md scale-105' 
                                                    : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'
                                                }`}
                                            >
                                                {seed}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <span className="text-slate-300 group-hover:text-blue-500 transition-colors transform group-hover:translate-x-1">
                                    <ArrowRight size={20} />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
             )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;