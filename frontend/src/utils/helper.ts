// Type definitions
interface ParsedArgs {
  [key: string]: unknown;
  task?: string;
  agent_counts?: unknown[];
  has_custom_questions?: boolean | string;
}

interface RunData {
  wandb_metadata?: {
    parsed_args?: ParsedArgs | ParsedArgs[];
  };
}

interface LLMConfig {
  modelName?: string;
  model?: string;
}

interface ExperimentData {
  experiment_name?: string;
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

// Helper function to safely access parsed_args regardless of structure
const getParsedArgsValue = (
  parsedArgs: ParsedArgs | ParsedArgs[] | undefined,
  key: string,
  defaultValue: unknown = null
): unknown => {
  const args = Array.isArray(parsedArgs) ? parsedArgs[0] : parsedArgs;
  return args?.[key] ?? defaultValue;
};

// Helper function for date formatting
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

// Map LLM config names to friendly display names
const mapLLMConfigToDisplayName = (configName: string): string => {
  const mapping: Record<string, string> = {
    gpt_3_5_turbo: "gpt-3.5-turbo",
    gpt_4o_mini: "gpt-4o-mini",
    gpt_4o: "gpt-4o",
    vec_llama_3_1_8B: "llama-3.1-8b-chat",
    vec_llama_3_1_70B: "llama-3.1-70b-chat",
    vec_mistral_7B: "mistral-7b",
    mistral_7b: "mistral-7b",
    llama_3_1_8b_chat: "llama-3.1-8b-chat",
  };

  const normalized = configName.toLowerCase().replace(/[-_\s]/g, "");

  for (const [key, value] of Object.entries(mapping)) {
    const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, "");
    if (
      normalized.includes(normalizedKey) ||
      normalizedKey.includes(normalized)
    ) {
      return value;
    }
  }

  return configName;
};

// Extract agents from parsed_args (newer format)
const extractAgentsFromParsedArgs = (
  parsedArgs: ParsedArgs | undefined
): string[] => {
  if (!parsedArgs) return [];

  const agents: string[] = [];

  Object.keys(parsedArgs).forEach((key) => {
    if (key.startsWith("llm_conf@")) {
      const configName = parsedArgs[key] as string;
      if (configName) {
        agents.push(mapLLMConfigToDisplayName(configName));
      }
    }
  });

  return agents;
};

// Main transform function with dynamic parsed_args handling
const transformExperiment = (data: ExperimentData): Experiment => {
  const experimentName = data.experiment_name || "Unknown Experiment";

  const parsedArgsRaw: ParsedArgs | ParsedArgs[] | undefined =
    data.runs?.[0]?.wandb_metadata?.parsed_args;

  const parsedArgs: ParsedArgs | undefined = Array.isArray(parsedArgsRaw)
    ? parsedArgsRaw[0]
    : parsedArgsRaw;

  console.log(`\n=== Processing experiment: ${experimentName} ===`);
  console.log("Parsed args:", parsedArgs);
  console.log("Model config:", data.model_config);

  let agents: string[] = [];

  agents = extractAgentsFromParsedArgs(parsedArgs);
  console.log("Agents from parsed_args:", agents);

  if (
    agents.length === 0 &&
    data.model_config?.LLM &&
    Array.isArray(data.model_config.LLM)
  ) {
    agents = data.model_config.LLM.map((config: LLMConfig) =>
      mapLLMConfigToDisplayName(config.modelName || config.model || "unknown")
    ).filter(
      (agent): agent is string =>
        typeof agent === "string" && agent !== "unknown"
    );
    console.log("Agents from model_config.LLM:", agents);
  }

  if (agents.length === 0) {
    agents = parseAgentsFromExperimentName(experimentName);
    console.log("Agents from experiment name:", agents);
  }

  agents = [...new Set(agents)];
  console.log("Final agents list:", agents);

  const rawDatasets: string[] = [
    ...new Set(
      (
        data.runs?.map((run: RunData) => {
          const parsedArgs = run.wandb_metadata?.parsed_args;
          const task = Array.isArray(parsedArgs)
            ? parsedArgs[0]?.task
            : parsedArgs?.task;
          return task;
        }) ?? []
      ).filter((task): task is string => typeof task === "string")
    ),
  ];

  const datasets = [
    ...new Set(
      (Array.isArray(rawDatasets) ? rawDatasets : [rawDatasets]).flatMap(
        (dataset) =>
          dataset.includes(",")
            ? dataset.split(",").map((d) => d.trim())
            : [dataset.trim()]
      )
    ),
  ];

  const hasHuman =
    (data.model_config?.Human &&
      Array.isArray(data.model_config.Human) &&
      data.model_config.Human.length > 0) ||
    agents.some(
      (a) =>
        a.toLowerCase().includes("human") ||
        a.toLowerCase().includes("human-participant") ||
        /^human_agent_\d+$/i.test(a)
    );

  console.log("Has human participation:", hasHuman);

  const numRounds =
    (getParsedArgsValue(parsedArgsRaw, "experiment.num_rounds", 0) as number) +
    1;
  const questionsPerDataset = getParsedArgsValue(
    parsedArgsRaw,
    "experiment.num_questions",
    100
  ) as number;

  let agentCounts: number[] = [];

  if (Array.isArray(parsedArgs?.["agent_counts"])) {
    const agentCountsArray = parsedArgs["agent_counts"] as unknown[];
    agentCounts = agentCountsArray.map((count: unknown) => Number(count));
  } else {
    const agentCountObj: Record<number, number> = {};
    Object.keys(parsedArgs || {}).forEach((key: string) => {
      const match = key.match(/^agent_counts\.(\d+)$/);
      if (match && parsedArgs) {
        const index = parseInt(match[1], 10);
        agentCountObj[index] = Number(parsedArgs[key]);
      }
    });

    const indices = Object.keys(agentCountObj).map(Number);
    const maxIndex = indices.length > 0 ? Math.max(...indices) : -1;
    if (maxIndex >= 0) {
      agentCounts = Array.from(
        { length: maxIndex + 1 },
        (_, i) => agentCountObj[i] || 0
      );
    }
  }

  const numAgentsFromCounts =
    agentCounts.length > 0
      ? agentCounts.reduce((sum, count) => sum + count, 0)
      : agents.length; // Fallback to agent list length

  const numAgents = numAgentsFromCounts + (hasHuman ? 1 : 0);
  const numQuestions = questionsPerDataset * datasets.length;

  console.log("Extracted values:", {
    numRounds,
    questionsPerDataset,
    numQuestions,
    agentCounts,
    numAgents,
  });

  const lastRoundPerformance =
    data.performance_data?.[data.performance_data.length - 1] || {};
  const majorityVote = lastRoundPerformance.majority_vote || 0;
  const isComplete = Boolean(data.is_complete);
  const completedRuns = data.completed_runs || 0;
  const availableSeeds: string[] = data.seeds_present
    ? data.seeds_present.map((s: unknown) => String(s))
    : ["0"];

  return {
    id: experimentName,
    name: experimentName,
    datasets,
    agents,
    status: isComplete ? "completed" : "in-progress",
    endDate: formatDate(data.last_updated),
    startDate: formatDate(data.created_at),
    numAgents,
    numRounds,
    numQuestions,
    hasHuman,
    availableSeeds,
    selectedSeed: availableSeeds[0] || "0",
    performance: {
      majority_vote: majorityVote,
      rounds_completed: completedRuns,
    },
    rawData: data,
  };
};

const parseAgentsFromExperimentName = (name: string): string[] => {
  const agents: string[] = [];
  if (typeof name !== "string") {
    console.warn("Invalid experiment name type:", typeof name, name);
    return ["gpt-4o-mini"];
  }
  const nameLower = name.toLowerCase();

  if (nameLower.includes("gpt")) agents.push("gpt-4o-mini");
  if (nameLower.includes("mistral")) agents.push("mistral-7b");
  if (nameLower.includes("meta") || nameLower.includes("llama"))
    agents.push("llama-3.1-8b-chat");
  if (nameLower.includes("human")) agents.push("human");

  const matches = nameLower.match(/(\d+)(gpt|mistral|meta)/g);
  if (matches) {
    matches.forEach((match) => {
      const numMatch = match.match(/\d+/);
      const typeMatch = match.match(/(gpt|mistral|meta)/);

      if (numMatch && typeMatch) {
        const num = parseInt(numMatch[0]);
        const type = typeMatch[1];

        for (let i = 0; i < num; i++) {
          if (type === "gpt" && !agents.includes("gpt-4o-mini"))
            agents.push("gpt-4o-mini");
          if (type === "mistral" && !agents.includes("mistral-7b"))
            agents.push("mistral-7b");
          if (type === "meta" && !agents.includes("llama-3.1-8b-chat"))
            agents.push("llama-3.1-8b-chat");
        }
      }
    });
  }

  return agents.length > 0 ? agents : ["gpt-4o-mini"];
};

export {
  transformExperiment,
  getParsedArgsValue,
  formatDate,
  parseAgentsFromExperimentName,
  mapLLMConfigToDisplayName,
  extractAgentsFromParsedArgs,
};

export type { ExperimentData, Experiment, ParsedArgs, RunData };
