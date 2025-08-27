"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/button/Button';
import { 
  Play, Square, AlertCircle, CheckCircle, Clock, ArrowLeft, 
  Brain, User, RefreshCw, Download, Terminal, Activity 
} from 'lucide-react';
import { logger } from '../../utils/logger';
import './DebateProgressMonitor.scss';

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
        setLogs(prev => [...prev, 'Experiment completed. Saving results to database (this may take some time). Check the dashboard shortly to view.']);
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
        return <Clock className="status-icon status-icon-starting" />;
      case 'running':
        return <Activity className="status-icon status-icon-running" />;
      case 'completed':
        return <CheckCircle className="status-icon status-icon-completed" />;
      case 'error':
        return <AlertCircle className="status-icon status-icon-error" />;
      default:
        return <Clock className="status-icon status-icon-idle" />;
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
    <div className="debate-progress-container">
      <div className="header">
        <div className="header-content">
          <div 
            onClick={onBack}
            className="back-button"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Form
          </div>
          <div className="header-main">
            <div>
              <h1 className="header-title">
                Debate Progress: {debateData.experimentName}
              </h1>
              <p className="header-subtitle">
                Monitoring experiment execution with real-time progress updates
              </p>
            </div>
            <div className="header-controls">
              <Button
                buttonStyle="secondary"
                variant="solid"
                color='black'
                icon={Download}
                iconPosition="start"
                iconColor="white"
                size="lg"
                onClick={downloadLogs}
                disabled={logs.length === 0}
              >
                Download Logs
              </Button>
              
              <Button
                buttonStyle="secondary"
                variant="solid"
                color='blue'
                icon={RefreshCw}
                iconPosition="start"
                iconColor="white"
                size="lg"
                onClick={restartDebate}
                disabled={isRunning}
              >
                Restart
              </Button>

              <Button
                buttonStyle="secondary"
                variant="solid"
                color='red'
                icon={Square}
                iconPosition="start"
                iconColor="white"
                size="lg"
                onClick={stopDebate}
                disabled={!isRunning}
              >
                Stop
              </Button> 
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="cards-grid">
          {/* Configuration Card */}
          <div className="card">
            <h3 className="card-title">
              <Brain className="w-5 h-5 text-blue-500" />
              Configuration
            </h3>
            <div className="config-grid">
              <div className="config-item">
                <span className="config-label">Questions:</span>
                <span className="config-value">{debateData.totalQuestions}</span>
              </div>
              <div className="config-item">
                <span className="config-label">Rounds:</span>
                <span className="config-value">{debateData.numRounds}</span>
              </div>
              <div className="config-item">
                <span className="config-label">Datasets:</span>
                <span className="config-value">{debateData.selectedDatasets.join(', ')}</span>
              </div>
              {debateData.seeds.length > 0 && (
                <div className="config-item">
                  <span className="config-label">Seeds:</span>
                  <span className="config-value">{debateData.seeds.join(', ')}</span>
                </div>
              )}
            </div>
            
            <div className="agents-section">
              <h4 className="agents-title">Agents ({debateData.agents.length})</h4>
              <div>
                {debateData.agents.map(agent => (
                  <div key={agent.id} className="agent-item">
                    {agent.model === 'human-participant' ? (
                      <User className="w-4 h-4 text-green-600" />
                    ) : (
                      <Brain className="w-4 h-4 text-blue-600" />
                    )}
                    <span><strong>{agent.name}:</strong> {agent.model}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status Card */}
          <div className="card">
            <h3 className="card-title">
              <Activity className="w-5 h-5 text-green-500" />
              Status
            </h3>
            <div className="status-section">
              <div className="status-item">
                {getStatusIcon()}
                <div className="status-info">
                  <div className="status-label">{status}</div>
                  {experimentId && (
                    <div className="status-detail">ID: {experimentId}</div>
                  )}
                </div>
              </div>
              
              <div>
                <div className="status-detail" style={{marginBottom: '0.5rem'}}>Current Phase</div>
                <div className="phase-display">{getPhaseDisplay()}</div>
              </div>

              {startTime && (
                <div>
                  <div className="status-detail" style={{marginBottom: '0.5rem'}}>Duration</div>
                  <div className="duration-display">
                    {formatDuration(startTime!, endTime ?? undefined)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Card */}
          <div className="card">
            <h3 className="card-title">
              <Clock className="w-5 h-5 text-purple-500" />
              Progress
            </h3>
            <div className="progress-section">
              <div>
                <div className="progress-header">
                  <span>Overall Progress</span>
                  <span className="progress-percentage">{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${
                      status === 'completed' 
                        ? 'progress-completed' 
                        : status === 'error' 
                        ? 'progress-error' 
                        : 'progress-running'
                    }`}
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {status === 'completed' && (
                <div className="success-notification">
                  <div className="success-content">
                    <div className="success-icon">
                      <CheckCircle />
                    </div>
                    <span className="success-text">Experiment Completed!</span>
                  </div>
                </div>
              )}

              {wsError && (
                <div className="error-notification">
                  <div className="error-content">
                    <AlertCircle className="w-5 h-5 error-icon" />
                    <span className="error-text">{wsError}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Logs Section */}
        <div className="logs-container">
          <div className="logs-header">
            <div className="logs-header-content">
              <div className="logs-title">
                <Terminal className="w-5 h-5 text-gray-600" />
                Execution Logs
              </div>
              <div className="logs-count">
                {logs.length} entries
              </div>
            </div>
          </div>
          <div className="logs-content">
            <div className="logs-inner">
              {logs.length === 0 ? (
                <div className="logs-empty">No logs yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="log-entry">
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
  );
};

export default DebateProgressMonitor;