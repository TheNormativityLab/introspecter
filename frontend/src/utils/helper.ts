interface ParsedArgs {
  [key: string]: unknown;
  task?: string;
  agent_counts?: unknown[];
  has_custom_questions?: boolean | string;
}

interface RunData {
  wandb_metadata?: {
    parsed_args?: ParsedArgs | ParsedArgs[];
    tags?: string[];
  };
  dataset_name?: string;
  status?: string;
}

interface LLMConfig {
  modelName?: string;
  model?: string;
}

interface ExperimentData {
  experiment_name?: string;
  // [UPDATED] Allow string OR array of strings
  dataset_name?: string | string[]; 
  runs?: RunData[];
  model_config?: {
    LLM?: LLMConfig[];
    Human?: unknown[];
  };
  performance_data?: Array<{
    majority_vote?: number;
  }>;
  is_complete?: boolean;
  completed_runs?: number;
  seeds_present?: unknown[];
  last_updated?: string;
  created_at?: string;
}

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
  rawData: ExperimentData;
}

const mapLLMConfigToDisplayName = (configName: string): string => {
  const mapping: Record<string, string> = {
    gpt_3_5_turbo: "gpt-3.5-turbo",
    gpt_4o_mini: "gpt-4o-mini",
    gpt_4o: "gpt-4o",
    llama_3_1_8b_chat: "llama-3.1-8b-chat",
    vec_llama_3_1_8b: "llama-3.1-8b-chat",
    vec_mistral_7b: "mistral-7b",
    mistral_7b: "mistral-7b",
  };

  const normalized = configName.toLowerCase().replace(/[-_\s]/g, "");
  for (const [key, value] of Object.entries(mapping)) {
    const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, "");
    if (normalized.includes(normalizedKey)) return value;
  }
  return configName;
};

const normalizeDatasetName = (name: string): string => {
  if (!name || typeof name !== 'string') return "unknown";
  const lower = name.toLowerCase();
  
  if (lower.includes("mmlu")) return "mmlu";
  if (lower.includes("gsm8k")) return "gsm8k";
  if (lower.includes("commonsense")) return "commonsense_qa";
  
  return lower;
};

export const transformExperiment = (data: ExperimentData): Experiment => {
  const experimentName = data.experiment_name || "Unknown Experiment";
  
  const rawWandb = data.runs?.[0]?.wandb_metadata;
  const wandbMetadata: any = typeof rawWandb === 'string' ? JSON.parse(rawWandb) : rawWandb;
  
  let agents: string[] = [];
  let numRounds = 1;
  const rawDatasets = new Set<string>();

  // [UPDATED] Check Root Level dataset_name (Handle both String and Array)
  if (data.dataset_name) {
    if (Array.isArray(data.dataset_name)) {
      data.dataset_name.forEach(d => {
        if (d && typeof d === 'string') rawDatasets.add(d);
      });
    } else if (typeof data.dataset_name === 'string') {
      rawDatasets.add(data.dataset_name);
    }
  }

  // 2. Check W&B Tags
  if (wandbMetadata?.tags && Array.isArray(wandbMetadata.tags)) {
    wandbMetadata.tags.forEach((tag: string) => {
      if (tag.startsWith("rounds-")) {
        numRounds = parseInt(tag.replace("rounds-", ""), 10);
      }
      
      if (tag.startsWith("task-")) {
        rawDatasets.add(tag.replace("task-", ""));
      }
      
      const isMetaTag = ["name-", "seed-", "task-", "rounds-"].some(prefix => tag.startsWith(prefix));
      if (!isMetaTag) {
        agents.push(mapLLMConfigToDisplayName(tag.replace(/-\d+$/, "")));
      }
    });
  }

  // 3. Fallback to runs if still empty
  if (rawDatasets.size === 0 && data.runs) {
    data.runs.forEach(r => {
      if (r.dataset_name) {
        rawDatasets.add(r.dataset_name);
      }
    });
  }

  if (agents.length === 0 && data.model_config?.LLM) {
    agents = data.model_config.LLM.map((c: LLMConfig) => 
      mapLLMConfigToDisplayName(c.modelName || c.model || "unknown")
    );
  }

  const normalizedDatasets = Array.from(rawDatasets)
    .map(normalizeDatasetName)
    .filter((v, i, a) => a.indexOf(v) === i); 

  const availableSeeds = data.seeds_present ? data.seeds_present.map(String) : ["0"];
  const isComplete = data.is_complete || data.runs?.every(r => r.status === "completed");

  return {
    id: experimentName,
    name: experimentName, 
    datasets: normalizedDatasets.length > 0 ? normalizedDatasets : ["unknown"],
    agents: [...new Set(agents)],
    status: isComplete ? "completed" : "in-progress",
    endDate: formatDate(data.last_updated),
    startDate: formatDate(data.created_at),
    numAgents: agents.length || 1,
    numRounds: numRounds, 
    numQuestions: (getParsedArgsValue(wandbMetadata?.parsed_args, "experiment.num_questions", 100) as number),
    hasHuman: agents.some(a => a.toLowerCase().includes("human")),
    availableSeeds,
    selectedSeed: availableSeeds[0] || "0",
    performance: {
      majority_vote: data.performance_data?.[data.performance_data.length - 1]?.majority_vote || 0,
      rounds_completed: data.completed_runs || 0,
    },
    rawData: data,
  };
};

const getParsedArgsValue = (
  parsedArgs: ParsedArgs | ParsedArgs[] | undefined,
  key: string,
  defaultValue: unknown = null
): unknown => {
  const args = Array.isArray(parsedArgs) ? parsedArgs[0] : parsedArgs;
  return args?.[key] ?? defaultValue;
};

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
};

const extractAgentsFromParsedArgs = (parsedArgs: ParsedArgs | undefined): string[] => {
  if (!parsedArgs) return [];
  const agents: string[] = [];
  Object.keys(parsedArgs).forEach((key) => {
    if (key.startsWith("llm_conf@")) {
      const configName = parsedArgs[key] as string;
      if (configName) agents.push(mapLLMConfigToDisplayName(configName));
    }
  });
  return agents;
};

const parseAgentsFromExperimentName = (name: string): string[] => {
  const agents: string[] = [];
  const nameLower = (name || "").toLowerCase();
  if (nameLower.includes("gpt")) agents.push("gpt-4o-mini");
  if (nameLower.includes("mistral")) agents.push("mistral-7b");
  if (nameLower.includes("meta") || nameLower.includes("llama")) agents.push("llama-3.1-8b-chat");
  return agents.length > 0 ? agents : ["gpt-4o-mini"];
};

export {
  getParsedArgsValue,
  formatDate,
  parseAgentsFromExperimentName,
  mapLLMConfigToDisplayName,
  extractAgentsFromParsedArgs,
  normalizeDatasetName
};

export type { ExperimentData, Experiment, ParsedArgs, RunData };