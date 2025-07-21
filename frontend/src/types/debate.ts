export interface DebateRun {
  _id: number;
  status: string;
  performance_data: Array<{
    [key: string]: number;
    majority_vote: number;
  }>;
  result_data: Array<{
    question_id: number;
    question: string;
    correct_answer: string;
    dataset?: string;
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
  seed: number;
  dataset_name: string;
  processedAt: string;
}

export interface MultiRunDebateData {
  success: boolean;
  experiment_name: string;
  seed: number;
  runs: DebateRun[];
}

export interface EvaluationResult {
  isCorrect: boolean;
  extractedAnswer: string | number | null;
}

export interface IncorrectSwitchQuestion {
  questionIndex: number;
  agentName: string;
  switchedFromRound: number;
  switchedToRound: number;
}

export interface TabConfig {
  id: string;
  label: string;
  icon: any;
}

export interface DatasetStats {
  [key: string]: { 
    total: number; 
  };
}

export interface RunDisplayInfo {
  dataset: string;
  totalQuestions: number;
  task: string;
}

