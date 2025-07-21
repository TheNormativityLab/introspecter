"use client";
import { logger } from '@/utils/logger';
import { Button } from '@/components/button/Button';
import { useEffect, useState, use } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'react-feather';
import { MultiRunDebateData, DebateRun, EvaluationResult, IncorrectSwitchQuestion } from '../../../types/debate';
import { ArrowLeft, Clock, Users, User, MessageSquare, BarChart3, Calendar, CheckCircle, PlayCircle, Trophy, Scale, Brain, UserRound, FileText, Filter, X, AlertCircle, Database, Layers, XCircle, TrendingDown } from 'lucide-react';

import {
  solveMathProblems,
  parseMmluAnswer,
  parseCommonsenseQaAnswer,
  parseMathAnswer,
  parseGsm8kAnswer,
  type TaskName
} from '../../../utils/evaluation';

export default function DebateDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const debateId = params.id as string;
  const seed = searchParams.get('seed') || 'default';
  const [activeTab, setActiveTab] = useState('questions');
  const [selectedRound, setSelectedRound] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debateData, setDebateData] = useState<MultiRunDebateData | null>(null);
  const [collapsedAgents, setCollapsedAgents] = useState<{ [key: string]: boolean }>({});
  const [filteredQuestions, setFilteredQuestions] = useState<number[]>([]);
  const [expandedResponses, setExpandedResponses] = useState<{ [key: string]: boolean }>({});
  const [evaluationResults, setEvaluationResults] = useState<{ [key: string]: EvaluationResult }>({});
  const [incorrectSwitches, setIncorrectSwitches] = useState<IncorrectSwitchQuestion[]>([]);

  const evaluateResponse = (
    response: string,
    correctAnswer: string | number,
    taskName: TaskName
  ): EvaluationResult => {
    let extractedAnswer: string | number | null = null;    
    if (taskName === 'mmlu') {
      extractedAnswer = parseMmluAnswer(response);
      if (extractedAnswer === null) {
        extractedAnswer = solveMathProblems(response);
      }
    } else if (taskName === 'math') {
      extractedAnswer = parseMathAnswer(response);
    } else if (taskName === 'commonsense_qa') {
      extractedAnswer = parseCommonsenseQaAnswer(response);
    } else if (taskName === 'gsm8k') {
      extractedAnswer = parseGsm8kAnswer(response);
      console.log('GSM8K Response:', response, 'Extracted Answer:', extractedAnswer);
    }

    let isCorrect = false;
    
    if (extractedAnswer !== null) {
      if (taskName === 'gsm8k') {
        const gtValue = solveMathProblems(correctAnswer.toString());
        const predValue = solveMathProblems(extractedAnswer.toString());    
        console.log('GSM8K Evaluation:', { gtValue, predValue });    
        isCorrect = predValue === gtValue;
      } else if (taskName === 'commonsense_qa' || taskName === 'mmlu') {
        isCorrect = extractedAnswer.toString().toUpperCase() === correctAnswer.toString().toUpperCase();
      } else if (taskName === 'math') {
        const gtValue = typeof correctAnswer === 'string' ? parseFloat(correctAnswer) : correctAnswer;
        const predValue = typeof extractedAnswer === 'string' ? parseFloat(extractedAnswer) : extractedAnswer;
        isCorrect = Math.abs(predValue - gtValue) < 1e-6;
      } else {
        isCorrect = extractedAnswer.toString().toUpperCase() === correctAnswer.toString().toUpperCase();
      }
    }
    
    return {
      isCorrect,
      extractedAnswer,
    };
  };

  const findIncorrectSwitches = () => {
    if (!currentRun?.result_data) return [];
    
    const switches: IncorrectSwitchQuestion[] = [];
    const taskName = inferDatasetFromTask(currentRun?.dataset_name) as TaskName;
    
    currentRun.result_data.forEach((questionData, questionIndex) => {
      const rounds = questionData.debate_session?.rounds || [];
      if (rounds.length < 2) return;
      
      Object.keys(rounds[0].responses || {}).forEach(agentName => {
        const agentEvaluations: boolean[] = [];
        
        rounds.forEach(round => {
          const response = round.responses[agentName] || '';
          const evaluation = evaluateResponse(response, questionData.correct_answer, taskName);
          agentEvaluations.push(evaluation.isCorrect);
        });
        
        for (let i = 1; i < agentEvaluations.length; i++) {
          const prevCorrect = agentEvaluations[i - 1];
          const currentCorrect = agentEvaluations[i];
          
          if (prevCorrect && !currentCorrect) {
            switches.push({
              questionIndex,
              agentName,
              switchedFromRound: i - 1,
              switchedToRound: i
            });
          }
        }
      });
    });
    
    return switches;
  };

  useEffect(() => {
    if (!currentRun?.result_data?.[selectedQuestion]) return;
    
    const newEvaluationResults: { [key: string]: EvaluationResult } = {};
    const questionData = currentRun.result_data[selectedQuestion];
    const taskName = inferDatasetFromTask(currentRun?.dataset_name) as TaskName;
    questionData.debate_session?.rounds?.forEach((round, roundIndex) => {
      Object.entries(round.responses).forEach(([agentName, response]) => {
        const key = `${agentName}_${roundIndex}`;
        newEvaluationResults[key] = evaluateResponse(
          response,
          questionData.correct_answer,
          taskName
        );
      });
    });
    
    setEvaluationResults(newEvaluationResults);
  }, [selectedQuestion, selectedRun, debateData]);

  useEffect(() => {
    const fetchDebate = async () => {
      try {
        if (!debateId) return;
        const response = await fetch(`/api/single-debate?experimentName=${encodeURIComponent(debateId)}&seed=${encodeURIComponent(seed)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();
        setTimeout(() => {
          setDebateData(data);
          setLoading(false);
        }, 1000);
        
      } catch (err) {
        setError("Failed to load debate data");
        console.error('Fetch error:', err);
        setLoading(false);
      }
    };

    fetchDebate();
  }, [debateId]);

  const getCurrentRun = (): DebateRun | null => {
    if (!debateData?.runs || debateData.runs.length === 0) return null;
    return debateData.runs[selectedRun] || debateData.runs[0];
  };

  const currentRun = getCurrentRun();

  useEffect(() => {
    if (currentRun) {
      const switches = findIncorrectSwitches();
      setIncorrectSwitches(switches);
    }
  }, [currentRun, selectedRun]);

  useEffect(() => {
    if (!currentRun?.result_data) return;

    let questions = currentRun.result_data.map((_, index) => index);
    
    if (activeTab === 'filter-incorrect') {
      const switchQuestions = [...new Set(incorrectSwitches.map(s => s.questionIndex))];
      questions = questions.filter(index => switchQuestions.includes(index));
    } else if (selectedDataset !== 'all') {
      questions = questions.filter(index => {
        const questionData = currentRun.result_data[index];
        const dataset = questionData.dataset || inferDatasetFromTask(currentRun.wandb_metadata?.parsed_args?.task);
        return dataset === selectedDataset;
      });
    }

    setFilteredQuestions(questions);
    
    if (questions.length > 0 && !questions.includes(selectedQuestion)) {
      setSelectedQuestion(questions[0]);
    }
  }, [currentRun, selectedDataset, activeTab, selectedQuestion, selectedRun, incorrectSwitches]);

  useEffect(() => {
    setSelectedQuestion(0);
    setSelectedRound(0);
  }, [selectedRun]);

  const inferDatasetFromTask = (task: string): string => {
    if (!task) return 'unknown';
    const lowerTask = task.toLowerCase();
    if (lowerTask.includes('mmlu')) return 'mmlu';
    if (lowerTask.includes('gsm8k')) return 'gsm8k';
    if (lowerTask.includes('commonsense_qa')) return 'commonsense_qa';
    if (lowerTask.includes('math')) return 'math';
    return 'unknown';
  };

  const getAvailableDatasets = () => {
    if (!currentRun?.result_data) return [];
    
    const datasets = new Set<string>();
    
    currentRun.result_data.forEach(question => {
      if (question.dataset) {
        datasets.add(question.dataset);
      }
    });
    
    if (datasets.size === 0) {
      const task = currentRun.wandb_metadata?.parsed_args?.task;
      if (task) {
        const taskDatasets = task.split(',').map(t => t.trim().toLowerCase());
        taskDatasets.forEach(dataset => {
          if (['mmlu', 'gsm8k', 'commonsense_qa', 'math'].includes(dataset)) {
            datasets.add(dataset);
          }
        });
      }
    }
    
    return Array.from(datasets).sort();
  };

  const getDatasetDisplayName = (dataset: string): string => {
    const displayNames: { [key: string]: string } = {
      'mmlu': 'MMLU',
      'gsm8k': 'GSM8K',
      'commonsense_qa': 'CommonsenseQA',
      'math': 'MATH'
    };
    return displayNames[dataset] || dataset.toUpperCase();
  };

  const getRunDisplayInfo = (run: DebateRun) => {
    const task = run.wandb_metadata?.parsed_args?.task;
    const dataset = (run as any).dataset_name || run.result_data?.[0]?.dataset || inferDatasetFromTask(task);
    const totalQuestions = run.result_data?.length || 0;
    
    return {
      dataset: getDatasetDisplayName(dataset),
      totalQuestions,
      task
    };
  };

  const toggleResponseExpansion = (agentName: string, roundIndex: number) => {
    const key = `${agentName}_${roundIndex}_expanded`;
    setExpandedResponses(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getDatasetStats = () => {
    if (!currentRun?.result_data) return {};
    
    const stats: { [key: string]: { total: number } } = {};
    
    currentRun.result_data.forEach((question, index) => {
      const dataset = question.dataset || inferDatasetFromTask(currentRun.wandb_metadata?.parsed_args?.task);
      if (!stats[dataset]) {
        stats[dataset] = { total: 0 };
      }
      stats[dataset].total++;
    });
    
    return stats;
  };

  const truncateText = (text: string): string => {
    if (!text) return '';
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length <= 2) return text;
    
    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();
    
    return `${firstLine}\n\n...\n\n${lastLine}`;
  };

  const toggleAgentCollapse = (agentName: string) => {
    setCollapsedAgents(prev => ({
      ...prev,
      [agentName]: !prev[agentName]
    }));
  };

  const renderEvaluationBadge = (evaluation: EvaluationResult) => {
    if (evaluation.isCorrect) {
      return (
        <div className="flex items-center space-x-2 mb-3">
          <span className="flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full border border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Correct
          </span>
          {evaluation.extractedAnswer !== null && (
            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 font-mono">
              Answer: {evaluation.extractedAnswer}
            </span>
          )}
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 mb-3">
          <span className="flex items-center px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full border border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            Incorrect
          </span>
          {evaluation.extractedAnswer !== null && (
            <span className="px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded border border-gray-200 font-mono">
              Answer: {evaluation.extractedAnswer}
            </span>
          )}
        </div>
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-3 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading debate...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!debateData?.runs || debateData.runs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center max-w-md">
          <p className="text-gray-600 mb-4">No debate data found.</p>
          <button 
            onClick={() => window.history.back()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formatText = (text: string) => {
    if (!text) return '';
    
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')        
        .replace(/### (.*?)(?=\n|$)/g, '<h3 class="font-semibold text-gray-800 mt-4 mb-2">$1</h3>')
        .replace(/## (.*?)(?=\n|$)/g, '<h2 class="font-bold text-gray-900 mt-4 mb-2">$1</h2>') 
        .replace(/# (.*?)(?=\n|$)/g, '<h1 class="font-bold text-gray-900 text-lg mt-4 mb-2">$1</h1>')        
        .replace(/\\\((.*?)\\\)/g, '<span class="inline-block bg-gray-100 px-1 rounded font-mono text-sm mx-0.5">$1</span>')
        .replace(/\\\[(.*?)\\\]/g, '<div class="bg-gray-100 p-3 rounded font-mono text-sm my-3">$1</div>')        
        .replace(/\\?boxed\{([^}]+)\}/g, '<span class="inline-block bg-blue-100 border border-blue-300 px-2 py-1 rounded font-semibold text-blue-800 mx-1">$1</span>')        
        .replace(/<<([^>]+)>>/g, '<span class="inline-block bg-purple-100 border border-purple-300 px-2 py-1 rounded font-mono text-sm text-purple-800 mx-1">$1</span>')        
        .replace(/\(([A-Z])\)(?=\s|$)/g, '<span class="inline-block bg-yellow-100 border border-yellow-300 px-2 py-1 rounded font-semibold text-yellow-800 mx-1">($1)</span>')        
        .replace(/^[\*\-] (.+)$/gm, '<li class="ml-4 mb-1.5 leading-relaxed">$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 mb-1.5 list-decimal leading-relaxed">$1</li>')        
        .replace(/\n\n+/g, '</p><p class="mb-3 leading-relaxed">')
        .replace(/\n/g, '<br class="mb-1">');
    
    if (!formatted.startsWith('<')) {
        formatted = `<p class="mb-3 leading-relaxed">${formatted}</p>`;
    }
    
    formatted = formatted
        .replace(/(<li class="ml-4 mb-1.5 list-decimal leading-relaxed">.*?<\/li>(?:\s*<li class="ml-4 mb-1.5 list-decimal leading-relaxed">.*?<\/li>)*)/gs, '<ol class="list-decimal list-inside mb-4 ml-4 space-y-1.5">$1</ol>')
        .replace(/(<li class="ml-4 mb-1.5 leading-relaxed">.*?<\/li>(?:\s*<li class="ml-4 mb-1.5 leading-relaxed">.*?<\/li>)*)/gs, '<ul class="list-disc list-inside mb-4 ml-4 space-y-1.5">$1</ul>');
    
    return formatted;
  };

  const extractRoundData = (performanceData: any[]) => {
    if (!performanceData || !Array.isArray(performanceData)) return [];
    
    return performanceData.map((roundObj, index) => {
      const roundKey = `round_${index + 1}`;
      return roundObj[roundKey] || {};
    }).filter(round => Object.keys(round).length > 0);
  };

  if (!currentRun) return null;

  const roundsData = extractRoundData(currentRun.performance_data || []);

  const getAgentNames = () => {
    const agents = [];
    const parsedArgs = currentRun.wandb_metadata?.parsed_args;
    
    if (parsedArgs?.['agent_counts.0'] > 0 && parsedArgs?.['llm_conf@llm1']) {
      const agentName = parsedArgs['llm_conf@llm1'].toLowerCase();
      if (agentName.includes('gpt')) agents.push('gpt-4o-mini');
      else if (agentName.includes('llama')) agents.push('llama-3.1-8b-chat');
      else if (agentName.includes('mistral')) agents.push('mistral-7b');
      else agents.push(parsedArgs['llm_conf@llm1']);
    }
    
    if (parsedArgs?.['agent_counts.1'] > 0 && parsedArgs?.['llm_conf@llm2']) {
      const agentName = parsedArgs['llm_conf@llm2'].toLowerCase();
      if (agentName.includes('gpt')) agents.push('gpt-4o-mini');
      else if (agentName.includes('llama')) agents.push('llama-3.1-8b-chat');
      else if (agentName.includes('mistral')) agents.push('mistral-7b');
      else agents.push(parsedArgs['llm_conf@llm2']);
    }
    
    if (parsedArgs?.['agent_counts.2'] > 0 && parsedArgs?.['llm_conf@llm3']) {
      const agentName = parsedArgs['llm_conf@llm3'].toLowerCase();
      if (agentName.includes('gpt')) agents.push('gpt-4o-mini');
      else if (agentName.includes('llama')) agents.push('llama-3.1-8b-chat');
      else if (agentName.includes('mistral')) agents.push('mistral-7b');
      else agents.push(parsedArgs['llm_conf@llm3']);
    }
    
    return agents;
  };

  const getActualAgentNames = () => {
    if (currentRun.result_data?.[0]?.debate_session?.rounds?.[0]?.responses) {
      return Object.keys(currentRun.result_data[0].debate_session.rounds[0].responses);
    }
    return getAgentNames();
  };

  const createAgentMapping = () => {
    const debateAgents = getActualAgentNames();
    const performanceAgents = roundsData.length > 0 ? 
      Object.keys(roundsData[0]).filter(key => key !== 'majority_vote') : [];
    
    const mapping: { [key: string]: string } = {};
    
    debateAgents.forEach((debateAgent, index) => {
      if (performanceAgents[index]) {
        mapping[debateAgent] = performanceAgents[index];
      }
    });
    
    return mapping;
  };

  const agents = getAgentNames();
  const actualAgentNames = getActualAgentNames();
  const agentMapping = createAgentMapping();
  const availableDatasets = getAvailableDatasets();
  const datasetStats = getDatasetStats();
  
  const numAgents = (currentRun.wandb_metadata?.parsed_args?.['agent_counts.0'] || 0) + 
                   (currentRun.wandb_metadata?.parsed_args?.['agent_counts.1'] || 0) + 
                   (currentRun.wandb_metadata?.parsed_args?.['agent_counts.2'] || 0);
  const numRounds = (currentRun.wandb_metadata?.parsed_args?.['experiment.num_rounds'] || 0) + 1;
  const datasets = currentRun.wandb_metadata?.parsed_args?.task?.split(',') || [];
  const numQuestions = currentRun.wandb_metadata?.parsed_args?.['experiment.num_questions'] * datasets.length || 0;
  const experimentName = currentRun.wandb_metadata?.parsed_args?.['experiment.name'] || `Experiment ${currentRun._id?.toString().slice(-6)}`;
  
  const formatDate = (dateString: string) => {
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

  const handleBackToDashboard = () => {
    window.history.back();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const tabs = [
    { id: 'questions', label: 'Debates', icon: Scale },
    { id: 'filter-incorrect', label: 'Analysis', icon: TrendingDown },
    { id: 'performance', label: 'Performance', icon: Trophy },
  ];

  const currentQuestionIndex = filteredQuestions.indexOf(selectedQuestion);
  const totalFilteredQuestions = filteredQuestions.length;

  const getCurrentQuestionSwitches = () => {
    return incorrectSwitches.filter(s => s.questionIndex === selectedQuestion);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handleBackToDashboard}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer font-medium"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(currentRun.status)}`}>
              {currentRun.status === 'completed' && <CheckCircle className="w-4 h-4 inline mr-1" />}
              {currentRun.status}
            </span>
          </div>
          
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-4">{experimentName}</h1>
            <div className="flex items-center flex-wrap gap-3 text-sm">
              <div className="flex items-center bg-white/70 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200/50 shadow-sm hover:shadow-md transition-all duration-200">
                <Calendar className="w-4 h-4 mr-2 text-blue-600" />
                <span className="font-medium text-slate-700">{formatDate(currentRun.wandb_metadata?.startedAt)}</span>
              </div>
              <div className="flex items-center bg-white/70 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200/50 shadow-sm hover:shadow-md transition-all duration-200">
                <Users className="w-4 h-4 mr-2 text-emerald-600" />
                <span className="font-medium text-slate-700">{numAgents} agents</span>
              </div>
              <div className="flex items-center bg-white/70 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200/50 shadow-sm hover:shadow-md transition-all duration-200">
                <MessageSquare className="w-4 h-4 mr-2 text-purple-600" />
                <span className="font-medium text-slate-700">{numRounds} rounds</span>
              </div>
              <div className="flex items-center bg-white/70 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200/50 shadow-sm hover:shadow-md transition-all duration-200">
                <FileText className="w-4 h-4 mr-2 text-amber-600" />
                <span className="font-medium text-slate-700">{numQuestions} questions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {debateData.runs.length > 1 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Database className="w-5 h-5 mr-2 text-blue-600" />
                Select Run
              </h3>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-lg font-medium">
                  Run {selectedRun + 1} of {debateData.runs.length}
                </span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {debateData.runs.map((run, index) => {
                const runInfo = getRunDisplayInfo(run);
                
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedRun(index)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-all border ${
                      selectedRun === index
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Run {index + 1}</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          selectedRun === index
                            ? 'bg-blue-500 text-blue-100'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {runInfo.dataset}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          selectedRun === index
                            ? 'bg-blue-500 text-blue-100'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {runInfo.totalQuestions} questions
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="bg-white rounded-lg shadow-sm mb-6 border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Navigate Questions
                </h3>
                <div className="flex items-center space-x-4">
                  <div className="flex space-x-2">
                    <Button
                      buttonStyle="secondary"
                      variant="outline"
                      icon={ChevronLeft}
                      iconPosition="start"
                      iconColor="grey"
                      label="Previous"
                      size="md"
                      onClick={() => {
                        const prevIndex = currentQuestionIndex - 1;
                        if (prevIndex >= 0) {
                          setSelectedQuestion(filteredQuestions[prevIndex]);
                          setSelectedRound(0);
                        }
                      }}
                      disabled={currentQuestionIndex <= 0 || totalFilteredQuestions === 0}
                    />
                    <Button
                      buttonStyle="secondary"
                      variant="outline"
                      icon={ChevronRight}
                      iconPosition="start"
                      iconColor="grey"
                      label="Next"
                      size="md"
                      onClick={() => {
                        const nextIndex = currentQuestionIndex + 1;
                        if (nextIndex < totalFilteredQuestions) {
                          setSelectedQuestion(filteredQuestions[nextIndex]);
                          setSelectedRound(0);
                        }
                      }}
                      disabled={currentQuestionIndex >= totalFilteredQuestions - 1 || totalFilteredQuestions === 0}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {totalFilteredQuestions > 0 && currentRun.result_data?.[selectedQuestion] && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                    Question {selectedQuestion + 1}
                    {currentRun.result_data[selectedQuestion].dataset && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {currentRun.result_data[selectedQuestion].dataset}
                      </span>
                    )}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Question:</h4>
                      <div className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 leading-relaxed">
                        <div dangerouslySetInnerHTML={{ 
                          __html: formatText(currentRun.result_data[selectedQuestion].question) 
                        }} />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Correct Answer:</h4>
                      <div className="text-gray-700 bg-green-50 p-4 rounded-lg border-l-4 border-green-400 border border-green-200">
                        <div 
                          className="font-medium"
                          dangerouslySetInnerHTML={{ 
                            __html: formatText(currentRun.result_data[selectedQuestion].correct_answer) 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                        <PlayCircle className="w-5 h-5 mr-2 text-blue-600" />
                        Agent Responses
                      </h3>
                    </div>
                    
                    <div className="divide-y divide-gray-200">
                      {Array.from({ length: numRounds }, (_, roundIndex) => (
                        <div key={roundIndex} className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-medium text-gray-900">Round {roundIndex + 1}</h4>
                            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                              {roundIndex === numRounds - 1 ? 'Final Round' : `Round ${roundIndex + 1} of ${numRounds}`}
                            </span>
                          </div>
                          
                          {currentRun.result_data[selectedQuestion].debate_session?.rounds?.[roundIndex] && (
                            <div className="space-y-4">
                              {actualAgentNames.map((agentName, index) => {
                                const fullResponse = currentRun.result_data[selectedQuestion].debate_session.rounds[roundIndex].responses[agentName] || '';
                                const truncatedResponse = truncateText(fullResponse);
                                const isExpanded = expandedResponses[`${agentName}_${roundIndex}_expanded`];
                                const displayResponse = isExpanded ? fullResponse : truncatedResponse;
                                const isTruncated = fullResponse !== truncatedResponse;
                                const isCollapsed = collapsedAgents[`${agentName}_${roundIndex}`];
                                
                                const evaluationKey = `${agentName}_${roundIndex}`;
                                const evaluation = evaluationResults[evaluationKey];
                                
                                let borderColor = 'border-gray-200';
                                let bgColor = 'bg-white';
                                
                                if (evaluation) {
                                  if (evaluation.isCorrect) {
                                    borderColor = 'border-green-400';
                                    bgColor = 'bg-green-50';
                                  } else {
                                    borderColor = 'border-red-400';
                                    bgColor = 'bg-red-50';
                                  }
                                }
                                
                                return (
                                  <div 
                                    key={`${agentName}_${roundIndex}`} 
                                    className={`rounded-lg border-2 p-4 transition-all ${borderColor} ${bgColor}`}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center space-x-2">
                                        <Brain className="w-4 h-4" />
                                        <h4 className="font-semibold text-gray-800">{agentName}</h4>
                                      </div>
                                      <button
                                        onClick={() => toggleAgentCollapse(`${agentName}_${roundIndex}`)}
                                        className="flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                                      >
                                        {isCollapsed ? (
                                          <>
                                            <span className="text-sm mr-1">Expand</span>
                                            <ChevronDown className="w-4 h-4" />
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-sm mr-1">Collapse</span>
                                            <ChevronUp className="w-4 h-4" />
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    
                                    {!isCollapsed && (
                                      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                        {/* Show detailed evaluation info */}
                                        {evaluation && renderEvaluationBadge(evaluation)}
                                        
                                        {displayResponse ? (
                                          <div>
                                            <div 
                                              className="text-sm leading-relaxed text-gray-700"
                                              dangerouslySetInnerHTML={{ 
                                                __html: formatText(displayResponse) 
                                              }}
                                            />
                                            {isTruncated && (
                                              <div className="mt-4 pt-3 border-t border-gray-200">
                                                <button
                                                  onClick={() => toggleResponseExpansion(agentName, roundIndex)}
                                                  className={`flex items-center text-sm font-medium transition-colors ${
                                                    isExpanded 
                                                      ? 'text-gray-600 hover:text-gray-800' 
                                                      : 'text-blue-600 hover:text-blue-800'
                                                  }`}
                                                >
                                                  {isExpanded ? (
                                                    <>
                                                      <ChevronUp className="w-4 h-4 mr-1" />
                                                      Show Less
                                                    </>
                                                  ) : (
                                                    <>
                                                      <ChevronDown className="w-4 h-4 mr-1" />
                                                      Show Full Response
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-center h-20">
                                            <span className="text-gray-400 italic">No response</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'filter-incorrect' && (
          <div className="space-y-6">
            {filteredQuestions.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Navigate Filtered Questions
                  </h3>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg">
                      {currentQuestionIndex + 1} of {totalFilteredQuestions} questions
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        buttonStyle="secondary"
                        variant="outline"
                        icon={ChevronLeft}
                        iconPosition="start"
                        iconColor="grey"
                        label="Previous"
                        size="md"
                        onClick={() => {
                          const prevIndex = currentQuestionIndex - 1;
                          if (prevIndex >= 0) {
                            setSelectedQuestion(filteredQuestions[prevIndex]);
                            setSelectedRound(0);
                          }
                        }}
                        disabled={currentQuestionIndex <= 0 || totalFilteredQuestions === 0}
                      />
                      <Button
                        buttonStyle="secondary"
                        variant="outline"
                        icon={ChevronRight}
                        iconPosition="start"
                        iconColor="grey"
                        label="Next"
                        size="md"
                        onClick={() => {
                          const nextIndex = currentQuestionIndex + 1;
                          if (nextIndex < totalFilteredQuestions) {
                            setSelectedQuestion(filteredQuestions[nextIndex]);
                            setSelectedRound(0);
                          }
                        }}
                        disabled={currentQuestionIndex >= totalFilteredQuestions - 1 || totalFilteredQuestions === 0}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {totalFilteredQuestions > 0 && currentRun.result_data?.[selectedQuestion] && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                    Question {selectedQuestion + 1}
                    {currentRun.result_data[selectedQuestion].dataset && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {currentRun.result_data[selectedQuestion].dataset}
                      </span>
                    )}
                  </h3>

                  {/* Show switches for this question */}
                  {getCurrentQuestionSwitches().length > 0 && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-medium text-red-900 mb-3 flex items-center">
                        <TrendingDown className="w-4 h-4 mr-2" />
                        Incorrect Switches in This Question:
                      </h4>
                      <div className="space-y-2">
                        {getCurrentQuestionSwitches().map((switchInfo, index) => (
                          <div key={index} className="flex items-center space-x-3 text-sm">
                            <span className="font-medium text-red-900">{switchInfo.agentName}</span>
                            <span className="text-red-700">
                              switched from correct (Round {switchInfo.switchedFromRound + 1}) to incorrect (Round {switchInfo.switchedToRound + 1})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Question:</h4>
                      <div className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 leading-relaxed">
                        <div dangerouslySetInnerHTML={{ 
                          __html: formatText(currentRun.result_data[selectedQuestion].question) 
                        }} />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Correct Answer:</h4>
                      <div className="text-gray-700 bg-green-50 p-4 rounded-lg border-l-4 border-green-400 border border-green-200">
                        <div 
                          className="font-medium"
                          dangerouslySetInnerHTML={{ 
                            __html: formatText(currentRun.result_data[selectedQuestion].correct_answer) 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                        <PlayCircle className="w-5 h-5 mr-2 text-blue-600" />
                        Agent Responses
                      </h3>
                    </div>
                    
                    <div className="divide-y divide-gray-200">
                      {Array.from({ length: numRounds }, (_, roundIndex) => (
                        <div key={roundIndex} className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-medium text-gray-900">Round {roundIndex + 1}</h4>
                            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                              {roundIndex === numRounds - 1 ? 'Final Round' : `Round ${roundIndex + 1} of ${numRounds}`}
                            </span>
                          </div>
                          
                          {currentRun.result_data[selectedQuestion].debate_session?.rounds?.[roundIndex] && (
                            <div className="space-y-4">
                              {actualAgentNames.map((agentName, index) => {
                                const fullResponse = currentRun.result_data[selectedQuestion].debate_session.rounds[roundIndex].responses[agentName] || '';
                                const truncatedResponse = truncateText(fullResponse);
                                const isExpanded = expandedResponses[`${agentName}_${roundIndex}_expanded`];
                                const displayResponse = isExpanded ? fullResponse : truncatedResponse;
                                const isTruncated = fullResponse !== truncatedResponse;
                                const isCollapsed = collapsedAgents[`${agentName}_${roundIndex}`];
                                
                                const evaluationKey = `${agentName}_${roundIndex}`;
                                const evaluation = evaluationResults[evaluationKey];
                                
                                const hasSwitched = getCurrentQuestionSwitches().some(s => 
                                  s.agentName === agentName && 
                                  (s.switchedFromRound === roundIndex || s.switchedToRound === roundIndex)
                                );
                                
                                let borderColor = 'border-gray-200';
                                let bgColor = 'bg-white';
                                
                                if (evaluation) {
                                  if (evaluation.isCorrect) {
                                    borderColor = hasSwitched ? 'border-orange-400' : 'border-green-400';
                                    bgColor = hasSwitched ? 'bg-orange-50' : 'bg-green-50';
                                  } else {
                                    borderColor = hasSwitched ? 'border-red-500' : 'border-red-400';
                                    bgColor = hasSwitched ? 'bg-red-100' : 'bg-red-50';
                                  }
                                }
                                
                                return (
                                  <div 
                                    key={`${agentName}_${roundIndex}`} 
                                    className={`rounded-lg border-2 p-4 transition-all ${borderColor} ${bgColor} ${hasSwitched ? 'ring-2 ring-orange-300' : ''}`}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center space-x-2">
                                        <Brain className="w-4 h-4" />
                                        <h4 className="font-semibold text-gray-800">{agentName}</h4>
                                        {hasSwitched && (
                                          <span className="px-2 py-1 bg-orange-200 text-orange-800 text-xs rounded-full flex items-center">
                                            <TrendingDown className="w-3 h-3 mr-1" />
                                            Switch Point
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => toggleAgentCollapse(`${agentName}_${roundIndex}`)}
                                        className="flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                                      >
                                        {isCollapsed ? (
                                          <>
                                            <span className="text-sm mr-1">Expand</span>
                                            <ChevronDown className="w-4 h-4" />
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-sm mr-1">Collapse</span>
                                            <ChevronUp className="w-4 h-4" />
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    
                                    {!isCollapsed && (
                                      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                        {/* Show detailed evaluation info */}
                                        {evaluation && renderEvaluationBadge(evaluation)}
                                        
                                        {displayResponse ? (
                                          <div>
                                            <div 
                                              className="text-sm leading-relaxed text-gray-700"
                                              dangerouslySetInnerHTML={{ 
                                                __html: formatText(displayResponse) 
                                              }}
                                            />
                                            {isTruncated && (
                                              <div className="mt-4 pt-3 border-t border-gray-200">
                                                <button
                                                  onClick={() => toggleResponseExpansion(agentName, roundIndex)}
                                                  className={`flex items-center text-sm font-medium transition-colors ${
                                                    isExpanded 
                                                      ? 'text-gray-600 hover:text-gray-800' 
                                                      : 'text-blue-600 hover:text-blue-800'
                                                  }`}
                                                >
                                                  {isExpanded ? (
                                                    <>
                                                      <ChevronUp className="w-4 h-4 mr-1" />
                                                      Show Less
                                                    </>
                                                  ) : (
                                                    <>
                                                      <ChevronDown className="w-4 h-4 mr-1" />
                                                      Show Full Response
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-center h-20">
                                            <span className="text-gray-400 italic">No response</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                Performance Over Rounds
              </h3>
              <div className="space-y-4">
                {roundsData.map((roundData, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-medium text-gray-900 flex items-center">
                        Round {index + 1}
                      </span>
                      <span className={`text-lg font-bold px-3 py-1 rounded-lg bg-white border ${getPerformanceColor(roundData.majority_vote || 0)}`}>
                        {((roundData.majority_vote || 0) * 100).toFixed(1)}% Majority Vote
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {Object.entries(roundData)
                        .filter(([key]) => key !== 'majority_vote')
                        .map(([agentKey, score]) => (
                          <div key={agentKey} className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                            <span className="text-sm text-gray-600 font-mono font-medium">
                              {agentKey}
                            </span>
                            <span className={`font-semibold px-2 py-1 rounded ${getPerformanceColor(score as number)}`}>
                              {((score as number) * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}