"use client";
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/button/Button';
import { User, LogOut, Plus, Clock, CheckCircle, Calendar, Filter, Search, X, ChevronDown, Users, MessageSquare, Activity, Brain, TrendingUp} from 'lucide-react';

interface Experiment {
  id: string;
  name: string;
  datasets: string[];
  agents: string[];
  status: 'completed' | 'in-progress';
  endDate: string;
  startDate: string;
  numAgents: number;
  numRounds: number;
  numQuestions: number;
  hasHuman: boolean;
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
  const [showFilters, setShowFilters] = useState(false);
  
  const availableAgents = ['llama-3.1-8b-chat', 'gpt-4o-mini', 'mistral-7b', 'human'];
  const defaultAgents = ['llama-3.1-8b-chat', 'mistral-7b', 'gpt-4o-mini'];
  const availableDatasets = ['gsm8k', 'mmlu', 'commonsense_qa'];
  const participationOptions = ['With Human', 'AI Only'];
  
  const getInitialFilters = (): FilterState => {
    if (typeof window === 'undefined') {
      return {
        searchTerm: '',
        status: 'all',
        selectedAgents: [],
        selectedDatasets: [],
        participationTypes: [],
        numRounds: 0,
        numAgents: 0
      };
    }

    try {
      const saved = localStorage.getItem('experiment-filters');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }

    return {
      searchTerm: '',
      status: 'all',
      selectedAgents: [],
      selectedDatasets: [],
      participationTypes: [],
      numRounds: 0,
      numAgents: 0
    };
  };

  const [filters, setFilters] = useState<FilterState>(getInitialFilters);

  useEffect(() => {
    fetchExperiments();
  }, []);
  useEffect(() => {
    const saveFilters = () => {
      try {
        localStorage.setItem('experiment-filters', JSON.stringify(filters));
      } catch (error) {
        console.error('Error saving filters:', error);
      }
    };

    const timeoutId = setTimeout(saveFilters, 500);
    return () => clearTimeout(timeoutId);
  }, [filters]);
  const fetchExperiments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/all-debates`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.finished_debates) {
        const transformedExperiments = data.finished_debates
          .map(transformExperiment)
          .filter((exp: { datasets: string | string[]; }) => !exp.datasets.includes('General Debate'));
        setExperiments(transformedExperiments);
      } else {
        setExperiments([]);
      }
    } catch (err) {
      setError("Failed to load experiments");
      console.error('Fetch error:', err);
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  };

  const parseDatasets = (topicString: string): string[] => {
    if (!topicString) return ['General Debate'];    
    if (topicString.includes(',')) {
      return topicString.split(',').map(dataset => dataset.trim());
    }    
    const knownDatasets = ['gsm8k', 'mmlu', 'commonsense_qa'];
    if (knownDatasets.includes(topicString.toLowerCase())) {
      return [topicString];
    }    
    return [topicString || 'General Debate'];
  };

  const transformExperiment = (data: any): Experiment => {
    const agents: string[] = [];
    const parsedArgs = data.wandb_metadata?.parsed_args;
    const agentKeys = [
      { countKey: 'agent_counts.0', llmKey: 'llm_conf@llm1' },
      { countKey: 'agent_counts.1', llmKey: 'llm_conf@llm2' },
      { countKey: 'agent_counts.2', llmKey: 'llm_conf@llm3' }
    ];

    for (const { countKey, llmKey } of agentKeys) {
      if (parsedArgs?.[countKey] > 0) {
        const agentRaw = parsedArgs[llmKey];
        if (agentRaw) {
          const agentName = agentRaw.toLowerCase();
          if (agentName.includes('gpt')) agents.push('gpt-4o-mini');
          if (agentName.includes('llama')) agents.push('llama-3.1-8b-chat');
          if (agentName.includes('mistral')) agents.push('mistral-7b');
          if (agentName.includes('human')) agents.push('human');
        }
      }
    }

    const hasHuman = data.modelConfig?.Human?.length > 0 || false;
    const experimentName = data.wandb_metadata?.parsed_args?.['experiment.name'] || `Experiment ${data._id?.slice(-6)}`;
    const topicString = data.wandb_metadata?.parsed_args?.task || 'General Debate';
    const datasets = parseDatasets(topicString);
    const numRounds = (data.wandb_metadata?.parsed_args?.['experiment.num_rounds'] + 1);
    const numAgents = 
      Number(data.wandb_metadata?.parsed_args?.['agent_counts.0'] || 0) +
      Number(data.wandb_metadata?.parsed_args?.['agent_counts.1'] || 0) +
      Number(data.wandb_metadata?.parsed_args?.['agent_counts.2'] || 0) +
      (hasHuman ? 1 : 0);
    const numQuestions = data.wandb_metadata?.parsed_args?.['experiment.num_questions'] || 100;
    const lastRoundPerformance = data.performance_data?.[data.performance_data.length - 1] || {};
    const majorityVote = lastRoundPerformance.majority_vote || 0;

    return {
      id: data._id,
      name: experimentName,
      datasets: datasets,
      agents: agents,
      status: data.status as 'completed' | 'in-progress',
      endDate: formatDate(data.processed_at),
      startDate: formatDate(data.wandb_metadata?.startedAt),
      numAgents: numAgents,
      numRounds: numRounds,
      numQuestions: numQuestions,
      hasHuman: hasHuman,
      performance: {
        majority_vote: majorityVote,
        rounds_completed: data.performance_data?.length || 0
      },
      rawData: data
    };
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return 'Unknown';
    }
  };

  const handleAgentToggle = (agent: string) => {
    setFilters(prev => ({
      ...prev,
      selectedAgents: prev.selectedAgents.includes(agent)
        ? prev.selectedAgents.filter(a => a !== agent)
        : [...prev.selectedAgents, agent]
    }));
  };

  const handleDatasetToggle = (dataset: string) => {
    setFilters(prev => ({
      ...prev,
      selectedDatasets: prev.selectedDatasets.includes(dataset)
        ? prev.selectedDatasets.filter(d => d !== dataset)
        : [...prev.selectedDatasets, dataset]
    }));
  };

  const handleParticipationToggle = (type: string) => {
    setFilters(prev => ({
      ...prev,
      participationTypes: prev.participationTypes.includes(type)
        ? prev.participationTypes.filter(t => t !== type)
        : [...prev.participationTypes, type]
    }));
  };

  const filteredExperiments = useMemo(() => {
    return experiments.filter(exp => {
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        if (
          !exp.name.toLowerCase().includes(searchTerm) &&
          !exp.datasets.some(dataset => dataset.toLowerCase().includes(searchTerm)) &&
          !exp.agents.some(agent => agent.toLowerCase().includes(searchTerm))
        ) {
          return false;
        }
      }

      if (filters.status !== 'all' && exp.status !== filters.status) {
        return false;
      }

      if (filters.selectedAgents.length > 0) {
        const expAgentList = [...exp.agents];
        if (exp.hasHuman) {
          expAgentList.push('Human');
        }
        
        const exactMatch = 
          expAgentList.length === filters.selectedAgents.length &&
          expAgentList.every(agent => {
            return filters.selectedAgents.some(selectedAgent => {
              if (selectedAgent === 'Human') {
                return agent === 'Human';
              }
              return agent.toLowerCase() === selectedAgent.toLowerCase();
            });
          }) &&
          filters.selectedAgents.every(selectedAgent => {
            if (selectedAgent === 'Human') {
              return expAgentList.includes('Human');
            }
            return expAgentList.some(agent => 
              agent.toLowerCase() === selectedAgent.toLowerCase()
            );
          });
        
        if (!exactMatch) return false;
      }

      if (filters.selectedDatasets.length > 0) {
        const exactMatch = 
          exp.datasets.length === filters.selectedDatasets.length &&
          exp.datasets.every(dataset => filters.selectedDatasets.includes(dataset)) &&
          filters.selectedDatasets.every(dataset => exp.datasets.includes(dataset));
        
        if (!exactMatch) return false;
      }

      if (filters.participationTypes.length > 0) {
        const matchesParticipation = filters.participationTypes.some(type => {
          if (type === 'With Human' && exp.hasHuman) return true;
          if (type === 'AI Only' && !exp.hasHuman) return true;
          return false;
        });
        if (!matchesParticipation) return false;
      }

      if (filters.numRounds > 0 && exp.numRounds !== filters.numRounds) {
        return false;
      }

      if (filters.numAgents > 0) {
        const totalAgents = exp.numAgents + (exp.hasHuman ? 1 : 0);
        if (totalAgents !== filters.numAgents) {
          return false;
        }
      }

      return true;
    });
  }, [experiments, filters]);

  const clearFilters = () => {
    const defaultFilters = {
      searchTerm: '',
      status: 'all',
      selectedAgents: [],
      selectedDatasets: [],
      participationTypes: [],
      numRounds: 0,
      numAgents: 0
    };
    
    setFilters(defaultFilters);
    
    try {
      localStorage.removeItem('experiment-filters');
    } catch (error) {
      console.error('Error clearing saved filters:', error);
    }
  };

  const hasActiveFilters = () => {
    return filters.searchTerm !== '' || 
           filters.status !== 'all' || 
           filters.selectedDatasets.length > 0 ||
           filters.participationTypes.length > 0 ||
           filters.selectedAgents.length !== defaultAgents.length ||
           !filters.selectedAgents.every(agent => defaultAgents.includes(agent)) ||
           filters.numRounds > 0 ||
           filters.numAgents > 0;
  };

  const handleNewExperiment = () => {
    router.push(`/debate/new`);
  };
  
  const handleViewExperiment = (experiment: Experiment) => {
    router.push(`/debate/${experiment.id}`);
  };

  const handleLogout = async () => {
    try {
      localStorage.clear();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/');
    }
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 0.6) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="w-4 h-4" />;
    return <Activity className="w-4 h-4 animate-pulse" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg font-medium">Loading experiments...</p>
          <p className="text-slate-400 text-sm mt-1">Please wait while we fetch your data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                  Normativity Lab
                </h1>
                <p className="text-sm text-slate-500 font-medium">AI Debate Research Platform</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button 
                buttonStyle='primary'
                onClick={handleNewExperiment}
                label='New Experiment'
                icon={Plus}
                size='md'
                iconColor='white'
              >
              </Button>
              
              <Button 
                onClick={handleLogout}
                buttonStyle="regular"
                label='Logout'
                icon={LogOut}
                size='md'
                iconPosition='start'
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center space-x-2"
              >
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center">
              <X className="w-5 h-5 text-red-500 mr-3" />
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 p-6 mb-8 shadow-lg">
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search experiments, datasets, or agents..."
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                className="w-full pl-12 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 text-slate-700 placeholder-slate-400"
              />
            </div>

            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 text-slate-700 min-w-[140px]"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In Progress</option>
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                hasActiveFilters() 
                  ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                  : 'bg-slate-50/50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {hasActiveFilters() && (
              <button
                onClick={clearFilters}
                className="flex items-center space-x-2 px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-all duration-200 font-medium"
              >
                <X className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {showFilters && (
            <div className="border-t border-slate-200 pt-3 mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">AI Agents</label>
                  <div className="bg-slate-50/50 rounded-lg p-2 text-sm space-y-1 border border-slate-200">
                    {availableAgents.map(agent => (
                      <label key={agent} className="flex items-center space-x-3 cursor-pointer hover:bg-white/50 rounded-lg p-2 transition-colors duration-150">
                        <input
                          type="checkbox"
                          checked={filters.selectedAgents.includes(agent)}
                          onChange={() => handleAgentToggle(agent)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                        />
                        <span className="text-sm text-slate-700">{agent}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Datasets</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto bg-slate-50/50 rounded-lg p-3 border border-slate-200">
                    {availableDatasets.map(dataset => (
                      <label key={dataset} className="flex items-center space-x-3 cursor-pointer hover:bg-white/50 rounded-lg p-2 transition-colors duration-150">
                        <input
                          type="checkbox"
                          checked={filters.selectedDatasets.includes(dataset)}
                          onChange={() => handleDatasetToggle(dataset)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                        />
                        <span className="text-sm text-slate-700">{dataset}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Participation</label>
                  <div className="space-y-2 bg-slate-50/50 rounded-lg p-3 border border-slate-200">
                    {participationOptions.map(type => (
                      <label key={type} className="flex items-center space-x-3 cursor-pointer hover:bg-white/50 rounded-lg p-2 transition-colors duration-150">
                        <input
                          type="checkbox"
                          checked={filters.participationTypes.includes(type)}
                          onChange={() => handleParticipationToggle(type)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                        />
                        <span className="text-sm text-slate-700">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Number of Rounds</label>
                  <select
                    value={filters.numRounds}
                    onChange={(e) => setFilters(prev => ({ ...prev, numRounds: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 text-slate-700"
                  >
                    <option value={0}>Any</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Number of Agents</label>
                  <select
                    value={filters.numAgents}
                    onChange={(e) => setFilters(prev => ({ ...prev, numAgents: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 text-slate-700"
                  >
                    <option value={0}>Any</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-slate-600 font-medium">
            Showing <span className="text-slate-900 font-semibold">{filteredExperiments.length}</span> of{' '}
            <span className="text-slate-900 font-semibold">{experiments.length}</span> experiments
            {hasActiveFilters() && <span className="text-blue-600 ml-1">(filtered)</span>}
          </p>
        </div>

        <div className="space-y-4">
          {filteredExperiments.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 p-12 text-center">
              <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                {hasActiveFilters() ? 'No experiments match your filters' : 'No experiments found'}
              </h3>
              <p className="text-slate-500">
                {hasActiveFilters() 
                  ? 'Try adjusting your filter criteria to see more results' 
                  : 'Your experiments will appear here once you create them'
                }
              </p>
            </div>
          ) : (
            filteredExperiments.map((experiment) => (
              <div key={experiment.id} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 p-6 hover:shadow-xl hover:border-slate-300/60 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-xl font-bold text-slate-900">{experiment.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            experiment.status === 'completed' 
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}>
                            {getStatusIcon(experiment.status)}
                            <span className="capitalize">{experiment.status}</span>
                          </span>
                          {experiment.hasHuman && (
                            <span className="inline-flex items-center space-x-1 px-3 py-1 bg-purple-100 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold">
                              <Users className="w-3 h-3" />
                              <span>Human</span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {experiment.performance.majority_vote > 0 && (
                        <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${getPerformanceColor(experiment.performance.majority_vote)}`}>
                          <div className="flex items-center space-x-1">
                            <TrendingUp className="w-4 h-4" />
                            <span>{(experiment.performance.majority_vote * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-slate-600 flex items-center space-x-1">
                          <span>Agents:</span>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {experiment.agents.slice(0, 3).map((agent, index) => (
                            <span key={index} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
                              {agent}
                            </span>
                          ))}
                          {experiment.agents.length > 3 && (
                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium border border-slate-200">
                              +{experiment.agents.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                          <span className="text-sm text-gray-600">Datasets:</span>
                          <div className="flex flex-wrap gap-1">
                            {experiment.datasets.map((dataset, index) => (
                              <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                {dataset}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {experiment.performance.majority_vote > 0 && (
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getPerformanceColor(experiment.performance.majority_vote)}`}>
                          {(experiment.performance.majority_vote * 100).toFixed(1)}% accuracy
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="w-4 h-4 mr-2 text-blue-500" />
                        <span className="font-medium">
                          {experiment.numAgents} {experiment.numAgents === 1 ? 'agent' : 'agents'}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-2 text-green-500" />
                        <span className="font-medium">{experiment.numRounds} {experiment.numRounds === 1 ? 'round' : 'rounds'}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <MessageSquare className="w-4 h-4 mr-2 text-purple-500" />
                        <span className="font-medium">{experiment.numQuestions}  questions</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-2 text-orange-500" />
                        <span className="font-medium">{experiment.startDate ?? experiment.endDate}</span>
                    </div>
                  </div>

                  <div className="ml-6">
                    <Button 
                      buttonStyle="secondary"
                      size="md"
                      variant="solid"
                      onClick={() => handleViewExperiment(experiment)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;