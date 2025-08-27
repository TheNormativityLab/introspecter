"use client";
import { useState } from 'react';
import { Users, MessageSquare, FileText, Settings, Brain, User, PlayCircle, Clock, CheckCircle, Plus, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import DebateProgressMonitor from '../../../utils/DebateProgressMonitor';

interface AgentConfig {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface DebateFormData {
  experimentName: string;
  numQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: AgentConfig[];
  customQuestions: string[];
  selectedDatasets: string[];
}

export default function NewDebatePage() {
  const [formData, setFormData] = useState<DebateFormData>({
    experimentName: '',
    numQuestions: 100,
    numRounds: 3,
    seeds: [],
    agents: [
      { id: 'agent1', name: 'Agent 1', model: 'gpt-4o-mini', enabled: true },
    ],
    customQuestions: [],
    selectedDatasets: []
  });

  const [isCreating, setIsCreating] = useState(false);
  const [createdDebateData, setCreatedDebateData] = useState<any>(null);
  const [showCustomQuestions, setShowCustomQuestions] = useState(false);
  const [showProgressMonitor, setShowProgressMonitor] = useState(false);

  const availableModels = [
    'gpt-4o-mini',
    'llama_3_1_8B',
    'mistral_7B',
    'human-participant'
  ];
  
  const availableDatasets = [
    { value: 'gsm8k', label: 'GSM8K (Math Word Problems)' },
    { value: 'mmlu', label: 'MMLU (Massive Multitask Language Understanding)' },
    { value: 'commonsense_qa', label: 'CommonsenseQA (Common Sense Reasoning)' },
    { value: 'custom', label: 'Custom Questions' }
  ];

  // Validation constants
  const MAX_QUESTIONS = 1000;
  const MAX_ROUNDS = 10;

  // Validation helpers
  const isQuestionsExceeded = () => formData.numQuestions > MAX_QUESTIONS;
  const isRoundsExceeded = () => formData.numRounds > MAX_ROUNDS;

  const handleBackToDashboard = () => {
    if (showProgressMonitor) {
      setShowProgressMonitor(false);
      setCreatedDebateData(null);
    } else {
      window.history.back();
    }
  };

  const addAgent = () => {
    const newAgentId = `agent${Date.now()}`;
    const newAgent: AgentConfig = {
      id: newAgentId,
      name: `Agent ${formData.agents.length + 1}`,
      model: 'gpt-4o-mini',
      enabled: true
    };
    
    setFormData(prev => ({
      ...prev,
      agents: [...prev.agents, newAgent]
    }));
  };

  const removeAgent = (agentId: string) => {
    setFormData(prev => ({
      ...prev,
      agents: prev.agents.filter(agent => agent.id !== agentId)
    }));
  };

  const updateAgent = (index: number, updates: Partial<AgentConfig>) => {
    setFormData(prev => ({
      ...prev,
      agents: prev.agents.map((agent, i) => 
        i === index ? { ...agent, ...updates } : agent
      )
    }));
  };

  const toggleDataset = (datasetValue: string) => {
    if (datasetValue === 'custom') {
      setShowCustomQuestions(!showCustomQuestions);
      if (!showCustomQuestions && formData.customQuestions.length === 0) {
        setFormData(prev => ({
          ...prev,
          customQuestions: ['']
        }));
      }
    }
    
    setFormData(prev => ({
      ...prev,
      selectedDatasets: prev.selectedDatasets.includes(datasetValue)
        ? prev.selectedDatasets.filter(d => d !== datasetValue)
        : [...prev.selectedDatasets, datasetValue]
    }));
  };

  const addCustomQuestion = () => {
    setFormData(prev => ({
      ...prev,
      customQuestions: [...prev.customQuestions, '']
    }));
  };

  const updateCustomQuestion = (index: number, question: string) => {
    setFormData(prev => ({
      ...prev,
      customQuestions: prev.customQuestions.map((q, i) => 
        i === index ? question : q
      )
    }));
  };

  const removeCustomQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customQuestions: prev.customQuestions.filter((_, i) => i !== index)
    }));
  };

  const getEnabledAgents = () => formData.agents.filter(agent => agent.enabled);

  const getTotalQuestions = () => {
    const datasetQuestions = formData.numQuestions;
    const customQuestions = formData.customQuestions.filter(q => q.trim() !== '').length;
    return datasetQuestions + customQuestions;
  };

  const isFormValid = () => {
    const hasName = formData.experimentName.trim() !== '';
    const hasValidNumbers = formData.numQuestions > 0 && formData.numRounds > 0;
    const hasAgents = getEnabledAgents().length >= 1;
    const hasDatasets = formData.selectedDatasets.filter(d => d !== 'custom').length > 0 || formData.customQuestions.some(q => q.trim() !== '');
    const withinLimits = !isQuestionsExceeded() && !isRoundsExceeded();
    
    return hasName && hasValidNumbers && hasAgents && hasDatasets && withinLimits;
  };

  const handleCreateDebate = async () => {
    setIsCreating(true);
    
    try {
      const debateData = {
        experimentName: formData.experimentName,
        totalQuestions: getTotalQuestions(),
        numRounds: formData.numRounds,
        seeds: formData.seeds.length > 0 ? formData.seeds : [1], // Default seed if none selected
        agents: getEnabledAgents(),
        selectedDatasets: formData.selectedDatasets.filter(d => d !== 'custom'),
        customQuestions: formData.customQuestions.filter(q => q.trim()),
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // Store the debate data and show progress monitor
      setCreatedDebateData(debateData);
      setShowProgressMonitor(true);
      
    } catch (error) {
      console.error('Failed to prepare debate:', error);
      alert('Failed to prepare debate. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Show progress monitor if debate was created
  if (showProgressMonitor && createdDebateData) {
    return (
      <DebateProgressMonitor 
        debateData={createdDebateData} 
        onBack={() => setShowProgressMonitor(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={handleBackToDashboard}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer font-medium mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Debate</h1>
          <p className="text-gray-600">Set up a new debate experiment with AI agents or human participants</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 space-y-8">
            
            {/* Basic Setup Section */}
            <div>
              <div className="flex items-center mb-4">
                <Settings className="w-5 h-5 text-blue-600 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Basic Setup</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Experiment Name
                  </label>
                  <input
                    type="text"
                    value={formData.experimentName}
                    onChange={(e) => setFormData(prev => ({ ...prev, experimentName: e.target.value }))}
                    placeholder="Enter a name for your debate experiment"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Questions
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={MAX_QUESTIONS}
                      value={formData.numQuestions}
                      onChange={(e) => setFormData(prev => ({ ...prev, numQuestions: parseInt(e.target.value) || 1 }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-blue-500 ${
                        isQuestionsExceeded() 
                          ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Number of questions to use from <strong>each</strong> selected dataset
                    </p>
                    {isQuestionsExceeded() && (
                      <div className="flex items-center mt-2 text-red-600">
                        <AlertTriangle className="w-4 h-4 mr-1" />
                        <span className="text-sm font-medium">
                          Maximum {MAX_QUESTIONS.toLocaleString()} questions allowed
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Rounds
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={MAX_ROUNDS}
                      value={formData.numRounds}
                      onChange={(e) => setFormData(prev => ({ ...prev, numRounds: parseInt(e.target.value) || 1 }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-blue-500 ${
                        isRoundsExceeded() 
                          ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {isRoundsExceeded() && (
                      <div className="flex items-center mt-2 text-red-600">
                        <AlertTriangle className="w-4 h-4 mr-1" />
                        <span className="text-sm font-medium">
                          Maximum {MAX_ROUNDS} rounds allowed
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Random Seed
                  </label>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4].map(seed => (
                        <label key={seed} className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.seeds.includes(seed)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({ 
                                  ...prev, 
                                  seeds: [...prev.seeds, seed].sort() 
                                }));
                              } else {
                                setFormData(prev => ({ 
                                  ...prev, 
                                  seeds: prev.seeds.filter(s => s !== seed) 
                                }));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">{seed}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">
                      Select one or more seeds (1-4) for reproducible random sampling
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Configuration Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Brain className="w-5 h-5 text-blue-600 mr-2" />
                  <h2 className="text-xl font-semibold text-gray-900">Configure Agents</h2>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg">
                    {getEnabledAgents().length} agents enabled
                  </span>
                  <button
                    type="button"
                    onClick={addAgent}
                    className="flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Agent
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {formData.agents.map((agent, index) => (
                  <div key={agent.id} className={`p-4 border rounded-lg ${agent.enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center flex-1">
                        <input
                          type="checkbox"
                          checked={agent.enabled}
                          onChange={(e) => updateAgent(index, { enabled: e.target.checked })}
                          className="mr-3"
                        />
                        <input
                          type="text"
                          value={agent.name}
                          onChange={(e) => updateAgent(index, { name: e.target.value })}
                          className="font-medium bg-transparent border-none focus:outline-none focus:ring-0 p-0 flex-1"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        {agent.enabled && agent.model === 'human-participant' && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                            Human
                          </span>
                        )}
                        {formData.agents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAgent(agent.id)}
                            className="text-red-600 hover:text-red-700 p-1"
                            title="Remove agent"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {agent.enabled && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Model
                        </label>
                        <select
                          value={agent.model}
                          onChange={(e) => updateAgent(index, { 
                            model: e.target.value,
                            isHuman: e.target.value === 'human-participant'
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {availableModels.map(model => (
                            <option key={model} value={model}>
                              {model === 'human-participant' ? 'Human Participant' : model}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {getEnabledAgents().length < 1 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    At least 1 agent must be enabled to create a debate.
                  </p>
                </div>
              )}
            </div>

            {/* Dataset Selection Section */}
            <div>
              <div className="flex items-center mb-4">
                <FileText className="w-5 h-5 text-blue-600 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Dataset Selection</h2>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose Datasets (can select multiple)
                </label>
                <p className="text-sm text-gray-600 mb-4">
                  Select one or more datasets. Each dataset will contribute {formData.numQuestions} questions to the debate.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {availableDatasets.map(dataset => (
                    <label key={dataset.value} className={`flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                      formData.selectedDatasets.includes(dataset.value) 
                        ? 'border-blue-300 bg-blue-50' 
                        : 'border-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.selectedDatasets.includes(dataset.value)}
                        onChange={() => toggleDataset(dataset.value)}
                        className="mr-3 mt-1"
                      />
                      <div>
                        <span className="font-medium block">{dataset.label}</span>
                        <span className="text-sm text-gray-600">
                          {dataset.value === 'custom' 
                            ? formData.customQuestions.filter(q => q.trim()).length > 0 
                              ? `${formData.customQuestions.filter(q => q.trim()).length} custom questions`
                              : ''
                            : ''
                          }
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Questions Section */}
              {showCustomQuestions && formData.selectedDatasets.includes('custom') && (
                <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">Custom Questions</h3>
                    <button
                      type="button"
                      onClick={addCustomQuestion}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Question
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Add your own custom questions in addition to the selected datasets.
                  </p>
                  <div className="space-y-3">
                    {formData.customQuestions.map((question, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <span className="flex-shrink-0 w-8 h-8 bg-white rounded-full flex items-center justify-center text-sm font-medium text-gray-600 mt-1 border border-gray-300">
                          {index + 1}
                        </span>
                        <textarea
                          value={question}
                          onChange={(e) => updateCustomQuestion(index, e.target.value)}
                          placeholder="Enter your custom question..."
                          rows={3}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        />
                        {formData.customQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCustomQuestion(index)}
                            className="flex-shrink-0 text-red-600 hover:text-red-700 mt-2"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Summary Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Summary</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Basic Settings</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li><strong>Name:</strong> {formData.experimentName || 'Not set'}</li>
                    <strong>Questions:</strong> {getTotalQuestions()} (applied to each dataset)
                    <li><strong>Rounds:</strong> {formData.numRounds}</li>
                    {formData.seeds.length > 0 && (
                      <li><strong>Seeds:</strong> {formData.seeds.join(', ')}</li>
                    )}
                    <li><strong>Datasets:</strong> {formData.selectedDatasets.filter(d => d !== 'custom').length > 0 ? formData.selectedDatasets.filter(d => d !== 'custom').map(d => availableDatasets.find(ds => ds.value === d)?.label).join(', ') : 'None selected'}</li>
                    {formData.customQuestions.filter(q => q.trim()).length > 0 && (
                      <li><strong>Custom Questions:</strong> {formData.customQuestions.filter(q => q.trim()).length}</li>
                    )}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Agents ({getEnabledAgents().length})</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {getEnabledAgents().map(agent => (
                      <li key={agent.id} className="flex items-center">
                        {agent.model === 'human-participant' ? (
                          <User className="w-4 h-4 mr-2 text-green-600" />
                        ) : (
                          <Brain className="w-4 h-4 mr-2 text-blue-600" />
                        )}
                        <strong>{agent.name}:</strong> <span className="ml-1">{agent.model}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Create Button */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button
              onClick={handleCreateDebate}
              disabled={isCreating || !isFormValid()}
              className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isCreating ? (
                <>
                  <Clock className="w-5 h-5 mr-2 animate-spin" />
                  Creating Debate...
                </>
              ) : (
                <>
                  Create Debate
                  <PlayCircle className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}