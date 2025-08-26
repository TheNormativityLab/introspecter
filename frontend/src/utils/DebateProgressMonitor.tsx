"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, AlertCircle, CheckCircle, Clock, ArrowLeft, 
  Brain, User, RefreshCw, Download, Terminal, Activity 
} from 'lucide-react';
import { logger } from './logger';

interface Agent {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface DebateData {
  experimentName: string;
  totalQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: Agent[];
  selectedDatasets: string[];
  customQuestions: string[];
  status: string;
  createdAt: string;
}

interface ProgressMessage {
  type: 'progress' | 'status' | 'error' | 'completion';
  experiment_id: string;
  message: string;
  progress?: {
    percentage?: number;
    current_step?: number;
    total_steps?: number;
    phase?: string;
  };
  timestamp: string;
  return_code?: number;
}

interface DebateProgressProps {
  debateData: DebateData;
  onBack: () => void;
}

const DebateProgressMonitor: React.FC<DebateProgressProps> = ({ debateData, onBack }) => {
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'completed' | 'error'>('idle');
  const [results, setResults] = useState<any>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      startDebate();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date();
    const duration = Math.floor((endTime.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const startDebate = async () => {
    if (status === 'starting' || isRunning) {
      logger.info('Start debate called but already starting/running, ignoring...');
      return;
    }

    try {
      setStatus('starting');
      setStartTime(new Date());
      setLogs(['Starting debate experiment...']);
      setWsError(null);
      setResults(null);
      
      const response = await fetch('/api/new-debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(debateData),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to start experiment');
      }
      
      setExperimentId(result.experiment_id);
      setLogs(prev => [...prev, `Experiment ID: ${result.experiment_id}`]);
      
      if (result.command) {
        setLogs(prev => [...prev, `🔧 Command: ${result.command}`]);
      }
      
      if (result.websocket_url) {
        connectWebSocket(result.experiment_id, result.websocket_url);
      } else {
        connectWebSocket(result.experiment_id);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus('error');
      setEndTime(new Date());
      setLogs(prev => [...prev, `Error: ${errorMessage}`]);
      setWsError(errorMessage);
    }
  };

  const connectWebSocket = (expId: string, wsUrl?: string) => {
    const websocketUrl = wsUrl || `ws://localhost:8001/ws/debate/${expId}`;
    setLogs(prev => [...prev, `🔌 Connecting to: ${websocketUrl}`]);
    
    wsRef.current = new WebSocket(websocketUrl);
    
    wsRef.current.onopen = () => {
      setIsRunning(true);
      setStatus('running');
      setLogs(prev => [...prev, 'WebSocket connected - monitoring progress...']);
      setWsError(null);
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const message: ProgressMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        setLogs(prev => [...prev, `Failed to parse message: ${event.data}`]);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsError('WebSocket connection error');
      setLogs(prev => [...prev, 'WebSocket connection error']);
    };
    
    wsRef.current.onclose = (event) => {
      setIsRunning(false);
      if (event.code !== 1000 && status !== 'completed') {
        setWsError(`Connection closed unexpectedly (${event.code})`);
        setLogs(prev => [...prev, `🔌 WebSocket closed: ${event.code} - ${event.reason || 'No reason provided'}`]);
      } else {
        setLogs(prev => [...prev, '🔌 WebSocket connection closed']);
      }
    };
  };

  const handleWebSocketMessage = (message: ProgressMessage) => {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    
    switch (message.type) {
      case 'status':
        setLogs(prev => [...prev, `[${timestamp}] ${message.message}`]);
        break;
        
      case 'progress':
        setLogs(prev => [...prev, `[${timestamp}] ${message.message}`]);
        
        if (message.progress) {
          if (message.progress.percentage !== null && message.progress.percentage !== undefined) {
            setProgress(message.progress.percentage);
          }
          if (message.progress.phase) {
            setCurrentPhase(message.progress.phase);
          }
        }
        break;
        
      case 'completion':
        setStatus('completed');
        setProgress(100);
        setCurrentPhase('completed');
        setIsRunning(false);
        setEndTime(new Date());
        setLogs(prev => [...prev, `[${timestamp}] ${message.message}`]);        
        const expId = message.experiment_id || experimentId;
        if (expId) {
          fetchResults(expId);
        } else {
          setLogs(prev => [...prev, 'No experiment ID available for fetching results']);
        }
        break;

      case 'error':
        setStatus('error');
        setIsRunning(false);
        setEndTime(new Date());
        setLogs(prev => [...prev, `[${timestamp}] Error: ${message.message}`]);
        setWsError(message.message);
        break;
    }
  };

  const fetchResults = async (expId: string) => {
    try {
      setLogs(prev => [...prev, 'Fetching experiment results...']);
      const response = await fetch(`/api/debate/${expId}/results`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      const result = await response.json();
      
      if (result.resultData) {
        setResults(result.resultData);
      } else {
        setLogs(prev => [...prev, 'Experiment completed. Saving results to database (this may take some time). Check the dashboard shortly to view."']);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setLogs(prev => [...prev, `Failed to fetch results: ${errorMessage}`]);
    }
  };

  const stopDebate = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsRunning(false);
    setStatus('idle');
    setProgress(0);
    setCurrentPhase('');
    setEndTime(new Date());
    setLogs(prev => [...prev, 'Experiment stopped by user']);
  };

  const restartDebate = () => {
    setStatus('idle');
    setProgress(0);
    setCurrentPhase('');
    setLogs([]);
    setResults(null);
    setWsError(null);
    setStartTime(null);
    setEndTime(null);
    setExperimentId(null);
    startDebate();
  };

  const downloadLogs = () => {
    const logContent = logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debate_logs_${debateData.experimentName}_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'starting':
        return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'running':
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPhaseDisplay = () => {
    switch (currentPhase) {
      case 'initializing':
        return 'Initializing experiment...';
      case 'loading':
        return 'Loading models and data...';
      case 'processing_questions':
        return 'Processing questions';
      case 'debate_rounds':
        return 'Running debate rounds';
      case 'saving':
        return 'Saving results...';
      case 'completed':
        return 'Completed successfully';
      default:
        return currentPhase || (isRunning ? 'In progress...' : 'Ready');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors cursor-pointer font-medium mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Form
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Debate Progress: {debateData.experimentName}
              </h1>
              <p className="text-gray-600">
                Monitoring experiment execution with real-time progress updates
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={downloadLogs}
                disabled={logs.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                <span>Download Logs</span>
              </button>
              <button
                onClick={restartDebate}
                disabled={isRunning}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restart</span>
              </button>
              <button
                onClick={stopDebate}
                disabled={!isRunning}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Experiment Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Configuration</h3>
            <div className="space-y-2 text-sm">
              <div><strong>Questions:</strong> {debateData.totalQuestions}</div>
              <div><strong>Rounds:</strong> {debateData.numRounds}</div>
              <div><strong>Datasets:</strong> {debateData.selectedDatasets.join(', ')}</div>
              {debateData.seeds.length > 0 && (
                <div><strong>Seeds:</strong> {debateData.seeds.join(', ')}</div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="font-semibold text-gray-700 mb-2">Agents ({debateData.agents.length})</h4>
              <div className="space-y-1">
                {debateData.agents.map(agent => (
                  <div key={agent.id} className="flex items-center text-sm">
                    {agent.model === 'human-participant' ? (
                      <User className="w-4 h-4 mr-2 text-green-600" />
                    ) : (
                      <Brain className="w-4 h-4 mr-2 text-blue-600" />
                    )}
                    <span><strong>{agent.name}:</strong> {agent.model}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Status</h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                {getStatusIcon()}
                <div>
                  <div className="font-medium text-gray-800 capitalize">{status}</div>
                  {experimentId && (
                    <div className="text-sm text-gray-600">ID: {experimentId}</div>
                  )}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-600 mb-2">Current Phase</div>
                <div className="font-medium text-blue-600">{getPhaseDisplay()}</div>
              </div>

              {startTime && (
                <div>
                  <div className="text-sm text-gray-600">Duration</div>
                  <div className="font-medium">
                    {formatDuration(startTime!, endTime ?? undefined)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Progress</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${
                      status === 'completed' 
                        ? 'bg-green-500' 
                        : status === 'error' 
                        ? 'bg-red-500' 
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {status === 'completed' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                    <span className="text-green-700 font-medium">Experiment Completed!</span>
                  </div>
                </div>
              )}

              {wsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-red-700 text-sm">{wsError}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Logs Section */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Terminal className="w-5 h-5 text-gray-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-800">Execution Logs</h3>
              </div>
              <div className="text-sm text-gray-500">
                {logs.length} entries
              </div>
            </div>
          </div>
          <div className="p-0">
            <div className="bg-[#2e3440] text-[#d8dee9] h-96 overflow-y-auto font-mono text-sm">
              <div className="p-4">
                {logs.length === 0 ? (
                  <div className="text-gray-500 italic">No logs yet...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="mb-1 leading-relaxed">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateProgressMonitor;
