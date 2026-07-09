// src/hooks/useLLMConfigs.ts
import { useState, useEffect } from 'react';

export interface LLMConfigSimple {
  value: string;
  label: string;
  model: string;
  provider: string;
}

export interface LLMConfigFull {
  config_name: string;
  file_path: string;
  display_name: string;
  provider: string;
  models: {
    model_name: string;
    litellm_model: string | null;
    timeout: number | null;
    rpm: number | null;
  }[];
  completion_params?: Record<string, any>;
}

const FALLBACK_MODELS: LLMConfigSimple[] = [
  { value: "gpt_4o_mini", label: "GPT-4o Mini", model: "openai/gpt-4o-mini", provider: "openai" },
  { value: "gpt_3_5_turbo", label: "GPT-3.5 Turbo", model: "openai/gpt-3.5-turbo", provider: "openai" },
  { value: "vec_llama_3_1_8B", label: "Llama 3.1 8B", model: "together_ai/meta-llama/Llama-3.1-8B", provider: "together_ai" },
  { value: "vec_mistral_7B", label: "Mistral 7B", model: "together_ai/mistralai/Mistral-7B", provider: "together_ai" },
  { value: "human-participant", label: "Human Participant", model: "human", provider: "human" },
];

export function useLLMConfigs() {
  const [configs, setConfigs] = useState<LLMConfigSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfigs() {
      try {
        setLoading(true);
        const response = await fetch('/api/llm-configs');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch LLM configs: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.models) {
          setConfigs(data.models);
          setError(null);
        } else {
          throw new Error(data.message || 'Invalid response format');
        }
      } catch (err) {
        console.error('Error fetching LLM configs:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch configs');
        setConfigs(FALLBACK_MODELS);
      } finally {
        setLoading(false);
      }
    }

    fetchConfigs();
  }, []);

  return { configs, loading, error };
}

export async function fetchLLMConfigDetails(configName: string): Promise<LLMConfigFull | null> {
  try {
    const response = await fetch(`/api/llm-configs/${configName}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.success && data.config) {
      return data.config;
    }
    return null;
  } catch (err) {
    console.error(`Error fetching config ${configName}:`, err);
    return null;
  }
}