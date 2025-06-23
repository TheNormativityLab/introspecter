"use client";
import { Button } from '@/components/button/Button';
import { useEffect, useState, use } from 'react';
import { ChevronLeft, ChevronRight, Icon } from 'react-feather';
import { ArrowLeft, Clock, Users, User, MessageSquare, BarChart3, Calendar, CheckCircle, PlayCircle, Trophy, Scale, Brain, UserRound, FileText } from 'lucide-react';

interface DebateData {
  _id: string;
  status: string;
  performance_data: Array<{
    [key: string]: number;
    majority_vote: number;
  }>;
  result_data: Array<{
    question_id: number;
    question: string;
    correct_answer: string;
    debate_session: {
      rounds: Array<{
        round_number: number;
        responses: {
          [agentKey: string]: string;
        };
        queries: any;
        metrics?: {
          [agentKey: string]: number;
          majority_vote: number;
        };
      }>;
    };
  }>;
  modelConfig: any;
  wandb_metadata: {
    startedAt: string;
    parsed_args: {
      task: string;
      'experiment.num_questions': number;
      'experiment.num_rounds': number;
      'agent_counts.0': number;
      'agent_counts.1': number;
      'agent_counts.2': number;
      'llm_conf@llm1': string;
      'llm_conf@llm2': string;
      'llm_conf@llm3'?: string;
      'experiment.name': string;
    };
  };
  processed_at: string;
}

export default function DebateDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: debateId } = use(params);
  const [activeTab, setActiveTab] = useState('questions');
  const [selectedRound, setSelectedRound] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debateData, setDebateData] = useState<{ debate: DebateData } | null>(null);

  useEffect(() => {
    const fetchDebate = async () => {
      try {
        console.log('Fetching debate data for ID:', debateId);
        if (!debateId) return;
        const response = await fetch(`/api/single-debate?id=${encodeURIComponent(debateId)}`, {
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

  if (!debateData?.debate) {
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

  const debate = debateData.debate;

  const formatText = (text: string) => {
    if (!text) return '';
    
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')        
        .replace(/### (.*?)(?=\n|$)/g, '<h3 class="font-semibold text-gray-800 mt-3 mb-2">$1</h3>')
        .replace(/## (.*?)(?=\n|$)/g, '<h2 class="font-bold text-gray-900 mt-3 mb-2">$1</h2>') 
        .replace(/# (.*?)(?=\n|$)/g, '<h1 class="font-bold text-gray-900 text-lg mt-3 mb-2">$1</h1>')        
        .replace(/\\\((.*?)\\\)/g, '<span class="inline-block bg-gray-100 px-1 rounded font-mono text-sm">$1</span>')
        .replace(/\\\[(.*?)\\\]/g, '<div class="bg-gray-100 p-2 rounded font-mono text-sm my-2">$1</div>')        
        .replace(/\\?boxed\{([^}]+)\}/g, '<span class="inline-block bg-blue-100 border border-blue-300 px-2 py-1 rounded font-semibold text-blue-800">$1</span>')        
        .replace(/<<([^>]+)>>/g, '<span class="inline-block bg-purple-100 border border-purple-300 px-2 py-1 rounded font-mono text-sm text-purple-800">$1</span>')        
        .replace(/\(([A-Z])\)(?=\s|$)/g, '<span class="inline-block bg-yellow-100 border border-yellow-300 px-2 py-1 rounded font-semibold text-yellow-800">($1)</span>')        
        .replace(/^[\*\-] (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 mb-1 list-decimal">$1</li>')        
        .replace(/\n\n+/g, '</p><p class="mb-2">')
        .replace(/\n/g, '<br>');
    
    if (!formatted.startsWith('<')) {
        formatted = `<p class="mb-2">${formatted}</p>`;
    }
    
    formatted = formatted
        .replace(/(<li class="ml-4 mb-1 list-decimal">.*?<\/li>(?:\s*<li class="ml-4 mb-1 list-decimal">.*?<\/li>)*)/gs, '<ol class="list-decimal list-inside mb-2 ml-4">$1</ol>')
        .replace(/(<li class="ml-4 mb-1">.*?<\/li>(?:\s*<li class="ml-4 mb-1">.*?<\/li>)*)/gs, '<ul class="list-disc list-inside mb-2 ml-4">$1</ul>');
    
    return formatted;
  };

  const extractRoundData = (performanceData: any[]) => {
    if (!performanceData || !Array.isArray(performanceData)) return [];
    
    return performanceData.map((roundObj, index) => {
      const roundKey = `round_${index + 1}`;
      return roundObj[roundKey] || {};
    }).filter(round => Object.keys(round).length > 0);
  };

  const roundsData = extractRoundData(debate.performance_data || []);
  const finalPerformance = roundsData[roundsData.length - 1]?.majority_vote || 0;
  const averagePerformance = roundsData.reduce((acc, round) => acc + (round.majority_vote || 0), 0) / (roundsData.length || 1);

  const getAgentNames = () => {
    const agents = [];
    const parsedArgs = debate.wandb_metadata?.parsed_args;
    
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
    if (debate.result_data?.[0]?.debate_session?.rounds?.[0]?.responses) {
      return Object.keys(debate.result_data[0].debate_session.rounds[0].responses);
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
  
  const numAgents = (debate.wandb_metadata?.parsed_args?.['agent_counts.0'] || 0) + 
                   (debate.wandb_metadata?.parsed_args?.['agent_counts.1'] || 0) + 
                   (debate.wandb_metadata?.parsed_args?.['agent_counts.2'] || 0);
  const numRounds = (debate.wandb_metadata?.parsed_args?.['experiment.num_rounds'] || 0) + 1;
  const numQuestions = debate.wandb_metadata?.parsed_args?.['experiment.num_questions'] || 0;
  const datasets = debate.wandb_metadata?.parsed_args?.task?.split(',') || [];
  const experimentName = debate.wandb_metadata?.parsed_args?.['experiment.name'] || `Experiment ${debate._id?.slice(-6)}`;
  
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
    { id: 'performance', label: 'Performance', icon: Trophy },
  ];

  const agentColors = [
    'bg-blue-50 border-blue-200',
    'bg-purple-50 border-purple-200', 
    'bg-orange-50 border-orange-200'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
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
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(debate.status)}`}>
              {debate.status === 'completed' && <CheckCircle className="w-4 h-4 inline mr-1" />}
              {debate.status}
            </span>
          </div>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{experimentName}</h1>
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center bg-gray-100 px-3 py-1 rounded-lg">
                <Calendar className="w-4 h-4 mr-2" />
                {formatDate(debate.wandb_metadata?.startedAt)}
              </div>
              <div className="flex items-center bg-gray-100 px-3 py-1 rounded-lg">
                <Users className="w-4 h-4 mr-2" />
                {numAgents} agents
              </div>
              <div className="flex items-center bg-gray-100 px-3 py-1 rounded-lg">
                <MessageSquare className="w-4 h-4 mr-2" />
                {numRounds} rounds
              </div>
              <div className="flex items-center bg-gray-100 px-3 py-1 rounded-lg">
                <FileText className="w-4 h-4 mr-2" />
                {numQuestions} questions
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <h3 className="text-lg font-semibold text-gray-900">Navigate Questions</h3>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg font-medium">
                    Question {selectedQuestion + 1} of {debate.result_data?.length || 0}
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
                      onClick={() => setSelectedQuestion(Math.max(0, selectedQuestion - 1))}
                      disabled={selectedQuestion === 0}
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
                          setSelectedQuestion(Math.min((debate.result_data?.length || 1) - 1, selectedQuestion + 1));
                          setSelectedRound(0);
                        }
                      }
                      disabled={selectedQuestion >= (debate.result_data?.length || 1) - 1}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {debate.result_data?.[selectedQuestion] && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                    Question {selectedQuestion + 1}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Question:</h4>
                      <div className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 leading-relaxed">
                        <div dangerouslySetInnerHTML={{ 
                          __html: formatText(debate.result_data[selectedQuestion].question) 
                        }} />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Correct Answer:</h4>
                      <div className="text-gray-700 bg-green-50 p-4 rounded-lg border-l-4 border-green-400 border border-green-200">
                        <div 
                          className="font-medium"
                          dangerouslySetInnerHTML={{ 
                            __html: formatText(debate.result_data[selectedQuestion].correct_answer) 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  {actualAgentNames.map((agentName, index) => (
                    <div key={agentName} className={`rounded-lg p-4 text-center border-2 ${agentColors[index]}`}>
                      <h3 className="font-semibold text-gray-800 flex items-center justify-center">
                        <Brain className="w-4 h-4 mr-2" />
                        {agentName}
                      </h3>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                        <PlayCircle className="w-5 h-5 mr-2 text-blue-600" />
                        Debate Rounds
                      </h3>
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg font-medium">
                        Round {selectedRound + 1} of {numRounds}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: numRounds }, (_, i) => (
                        <Button
                          key={i}
                          buttonStyle={selectedRound === i ? "primary" : "secondary"}
                          variant={selectedRound === i ? "solid" : "outline"}
                          label={`Round ${i + 1}`}
                          onClick={() => setSelectedRound(i)}
                        />
                      ))}
                    </div>
                  </div>

                  {debate.result_data[selectedQuestion].debate_session?.rounds?.[selectedRound] && (
                    <div className="p-6">
                      <div className="grid grid-cols-3 gap-6">
                        {actualAgentNames.map((agentName, index) => {
                          const response = debate.result_data[selectedQuestion].debate_session.rounds[selectedRound].responses[agentName] || '';
                          
                          return (
                            <div key={agentName} className={`rounded-lg border-2 p-6 ${agentColors[index]}`}>
                              <div className="bg-white rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto border border-gray-200 shadow-sm">
                                {response ? (
                                  <div 
                                    className="text-sm leading-relaxed text-gray-700"
                                    dangerouslySetInnerHTML={{ 
                                      __html: formatText(response) 
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-gray-400 italic">No response</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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