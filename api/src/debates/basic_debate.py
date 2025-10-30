# src/debates/basic_debate.py
import asyncio
import logging
import uuid
import json
from typing import List, Optional, Dict, Any
from collections import Counter
import time, re
from collections import Counter
from omegaconf import OmegaConf
from datetime import datetime
from src.agents.base_agent import AgentConfig
from src.agents.debate.basic_debate_agent import BasicDebateAgent
from src.llm_api import PromptConfig, LLMConfig
from src.environments.debate.utils import _normalize_answer as normalize_util
from src.environments.debate.utils import _answers_match as answers_util
from src.environments.debate.adts import (
    DebateResult,
    DebateRound,
    DebateProcedureResult,
)
from src.database.database import DatabaseManager
from src.database.repository import DebateRepository

logger = logging.getLogger(__name__)


@staticmethod
def normalize_model_name(model_name: str) -> str:
    """
    Normalize model names for consistent matching.
    Always converts to hyphen format to match actual model names.
    
    Examples:
        gpt_4o_mini -> gpt-4o-mini
        gpt_3_5_turbo -> gpt-3.5-turbo
        gpt-4o-mini -> gpt-4o-mini (unchanged)
    """
    if not model_name:
        return ""
    
    normalized = model_name.lower().strip()    
    if normalized in ['human-participant', 'human', 'mock/human', 'human_participant']:
        return 'human-participant'    
    normalized = normalized.replace('_', '-')    
    normalized = re.sub(r'-(\d+)-(\d+)-', r'-\1.\2-', normalized)
    return normalized

class BasicDebateOrchestrator:
    def __init__(self):
        self.debate_id: Optional[uuid.UUID] = None
        self.config: Optional[Dict[str, Any]] = None
        self.agents: List[BasicDebateAgent] = []
        self.agent_metadata: Dict[str, Dict[str, Any]] = {}
        self.questions: List[Dict[str, Any]] = []
        self.current_question_index: int = 0
        self.current_round: int = 0
        self.num_rounds: int = 3
        self.task: str = ""
        self.summarize: bool = True
        self.db_manager: Optional[DatabaseManager] = None
        self.semaphore: Optional[asyncio.Semaphore] = None
        self.status: str = "initialized"
        self.current_question_session_id: Optional[int] = None
        self.progress_queue: Optional[asyncio.Queue] = None
        self.hydra_cfg: Optional[Dict[str, Any]] = None
        self.human_response_queue: asyncio.Queue = asyncio.Queue()
        self.human_agent_name: Optional[str] = None
        self.agent_name_map: Dict[str, Any] = {}
        self.human_agent_names: set = set()

    async def initialize_from_hydra(
        self,
        debate_id: uuid.UUID,
        hydra_cfg: Dict[str, Any],
        questions: List[Dict[str, Any]],
        num_rounds: int,
        num_agents: int,
        agent_models: list,
        summarize: bool = True
    ):
        """
        Initialize orchestrator from Hydra config.
        
        Args:
            agent_models: List of model config names in exact order 
                        (e.g., ['gpt_4o_mini', 'human-participant', 'gpt_4o_mini'])
        """
        self.debate_id = debate_id
        self.questions = questions
        self.num_rounds = num_rounds
        self.summarize = summarize
        self.hydra_cfg = hydra_cfg
        self.task = hydra_cfg.get("task", {}).get("name", "unknown")
        
        self.config = {
            "task": self.task,
            "num_agents": num_agents,
            "num_rounds": num_rounds,
            "summarize": summarize,
            "agent_models": agent_models
        }
        
        self.db_manager = DatabaseManager()
        self.semaphore = asyncio.Semaphore(num_agents)
        
        self.agents = await self._create_agents_from_models(hydra_cfg, agent_models)
        
        self.progress_queue = asyncio.Queue()
        from src.api.tasks import store_wandb_metadata
        await store_wandb_metadata(
            str(debate_id), 
            {
                "task": self.task,
                "num_rounds": num_rounds,
                "num_questions": len(questions),
                "agent_models": agent_models,
                "llm_configs": self._extract_llm_configs_from_hydra(hydra_cfg, agent_models)
            },
            hydra_cfg
        )
        
        self.status = "ready"
        logger.info(f"Initialized debate {debate_id} with {num_agents} agents in order: {agent_models}")

    async def _create_agents_from_models(
        self,
        hydra_cfg: Dict[str, Any],
        agent_models: List[str]
    ) -> List[BasicDebateAgent]:
        """
        Create agents in the exact order specified by agent_models.
        This ensures human agents are placed at the correct index.
        
        Args:
            hydra_cfg: Hydra configuration
            agent_models: List like ['gpt_4o_mini', 'human-participant', 'gpt_4o_mini']
        
        Returns:
            List of agents in the specified order
        """
        task_config = hydra_cfg.get("task", {})
        task = task_config.get("name", "unknown")
        
        agent_prompts = hydra_cfg.get("agent_prompts") or {}
        task_partials = hydra_cfg.get("task", {}).get("partials") or {}
        
        prompts = {
            "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant."),
            "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
        }
        
        llm_configs = {
            'llm1': hydra_cfg.get("llm1") or {},
            'llm2': hydra_cfg.get("llm2") or {},
            'llm3': hydra_cfg.get("llm3") or {},
        }
        
        agents = []
        human_count = 0
        model_counts = {}
        
        logger.info(f"Creating {len(agent_models)} agents in specified order")
        
        for agent_idx, model_name in enumerate(agent_models):
            logger.info(f"Creating agent {agent_idx}: {model_name}")
            
            is_human = model_name.lower() in ['human-participant', 'human', 'mock/human']
            
            if is_human:
                agent_name = f"human_agent_{human_count}"
                human_count += 1
                
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=None,
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )
                
                await agent.build()
                await agent.reset()
                
                # Track human agent
                self.human_agent_names.add(agent.name)
                self.human_agent_name = agent.name
                self.agent_metadata[agent.name] = {
                    "model_name": "human", 
                    "is_human": True,
                    "agent_instance": agent
                }
                self.agent_name_map[agent.name] = agent
                
                logger.info(f"Created human agent at position {agent_idx}: {agent.name}")
                
            else:
                if model_name not in model_counts:
                    model_counts[model_name] = 0
                
                agent_name = f"{model_name}_agent_{model_counts[model_name]}"
                model_counts[model_name] += 1
                
                llm_config_dict = llm_configs.get(model_name)
                if not llm_config_dict:
                    llm_config_dict = hydra_cfg.get("llm1") or {}
                    logger.warning(f"Using fallback LLM config (llm1) for {model_name}")
                
                llm_config_omega = OmegaConf.create(llm_config_dict)
                
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=LLMConfig.from_hydra_config(llm_config_omega),
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )
                
                await agent.build()
                await agent.reset()
                
                actual_model_name = "unknown"
                try:
                    actual_model_name = agent.config.llm_config.language_models[0].model_name if agent.config.llm_config.language_models else model_name
                except Exception:
                    actual_model_name = model_name
                
                self.agent_metadata[agent.name] = {
                    "model_name": actual_model_name,
                    "is_human": False
                }
                self.agent_name_map[agent.name] = agent
                
                logger.info(f"Created LLM agent at position {agent_idx}: {agent.name} ({actual_model_name})")
            
            agents.append(agent)
        
        logger.info(f"Successfully created {len(agents)} agents ({human_count} human, {len(agents) - human_count} LLM)")
        logger.info(f"Agent order: {[a.name for a in agents]}")
        
        return agents

    async def _create_agents_from_models(
        self,
        hydra_cfg: Dict[str, Any],
        agent_models: List[str]
    ) -> List[BasicDebateAgent]:
        """
        Create agents in the exact order specified by agent_models.
        This ensures human agents are placed at the correct index.
        
        Args:
            hydra_cfg: Hydra configuration
            agent_models: List like ['gpt-4o-mini', 'human-participant', 'gpt-3.5-turbo']
        
        Returns:
            List of agents in the specified order
        """
        task_config = hydra_cfg.get("task", {})
        task = task_config.get("name", "unknown")
        
        agent_prompts = hydra_cfg.get("agent_prompts") or {}
        task_partials = hydra_cfg.get("task", {}).get("partials") or {}
        
        prompts = {
            "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant."),
            "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
        }
        
        # Get all available LLM configs from llm1, llm2, llm3
        available_llm_configs = []
        for i in range(1, 4):
            llm_key = f"llm{i}"
            if llm_key in hydra_cfg and hydra_cfg[llm_key]:
                available_llm_configs.append(hydra_cfg[llm_key])
                logger.info(f"Found config at {llm_key}")
        
        # Build a mapping from normalized model names to their configs
        model_to_config = {}
        model_aliases = {}  # Add alias mapping

        for llm_config in available_llm_configs:
            # Extract model name from the config
            model_name = None
            
            # Try to get from language_models first (most reliable for Hydra configs)
            if "language_models" in llm_config:
                lang_models = llm_config["language_models"]
                if lang_models and len(lang_models) > 0:
                    first_model = lang_models[0]
                    # Get from litellm_params.model first, then model_name
                    if "litellm_params" in first_model:
                        model_name = first_model["litellm_params"].get("model")
                    if not model_name:
                        model_name = first_model.get("model_name")
            
            # Fallback to litellm_params at root level
            if not model_name and "litellm_params" in llm_config:
                model_name = llm_config["litellm_params"].get("model")
            
            # Final fallback to model or modelName fields
            if not model_name:
                model_name = llm_config.get("model") or llm_config.get("modelName")
            
            if model_name:
                # Store both normalized and original
                normalized = normalize_model_name(model_name)
                model_to_config[normalized] = llm_config
                model_to_config[model_name] = llm_config  # Also store original
                
                # Add common aliases
                # For together_ai/mistralai/Mistral-7B-Instruct-v0.2
                if 'mistral' in model_name.lower() and '7b' in model_name.lower():
                    model_aliases['mistral-7b'] = normalized
                    model_aliases['mistral_7b'] = normalized
                
                # For together_ai/meta-llama/Llama-3-8b-chat-hf
                if 'llama' in model_name.lower() and '3' in model_name.lower():
                    model_aliases['llama-3-8b'] = normalized
                    model_aliases['llama_3_8b'] = normalized
                
                logger.info(f"Mapped model '{model_name}' (normalized: '{normalized}') to config")
        
        agents = []
        human_count = 0
        model_counts = {}
        
        logger.info(f"Creating {len(agent_models)} agents in specified order")
        
        for agent_idx, model_name in enumerate(agent_models):
            logger.info(f"Creating agent {agent_idx}: {model_name}")
            
            is_human = normalize_model_name(model_name) == 'human-participant'
            
            if is_human:
                agent_name = f"human_agent_{human_count}"
                human_count += 1
                
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=None,
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )
                
                await agent.build()
                await agent.reset()
                
                # Track human agent
                self.human_agent_names.add(agent.name)
                self.human_agent_name = agent.name
                self.agent_metadata[agent.name] = {
                    "model_name": "human", 
                    "is_human": True,
                    "agent_instance": agent
                }
                self.agent_name_map[agent.name] = agent
                
                logger.info(f"✓ Created human agent at position {agent_idx}: {agent.name}")
                
            else:
                if model_name not in model_counts:
                    model_counts[model_name] = 0
                
                agent_name = f"{model_name}_agent_{model_counts[model_name]}"
                model_counts[model_name] += 1
                
                # Find the matching config by trying multiple lookup strategies
                normalized_model = normalize_model_name(model_name)
                llm_config_dict = None
                
                # Strategy 1: Try normalized name (with hyphens)
                if normalized_model in model_to_config:
                    llm_config_dict = model_to_config[normalized_model]
                    logger.info(f"  Found config via normalized name: {normalized_model}")
                
                # Strategy 2: Try original name as-is
                if not llm_config_dict and model_name in model_to_config:
                    llm_config_dict = model_to_config[model_name]
                    logger.info(f"  Found config via original name: {model_name}")
                
                # Strategy 3: Try with underscores (for cases where model_name has hyphens)
                if not llm_config_dict:
                    alt_name_underscores = model_name.replace('-', '_')
                    if alt_name_underscores in model_to_config:
                        llm_config_dict = model_to_config[alt_name_underscores]
                        logger.info(f"  Found config via underscore name: {alt_name_underscores}")
                
                # Strategy 4: Try with hyphens (for cases where model_name has underscores)
                if not llm_config_dict:
                    alt_name_hyphens = model_name.replace('_', '-')
                    if alt_name_hyphens in model_to_config:
                        llm_config_dict = model_to_config[alt_name_hyphens]
                        logger.info(f"  Found config via hyphen name: {alt_name_hyphens}")
                
                # Strategy 5: Fuzzy match - check if the normalized model name appears in any available config
                if not llm_config_dict:
                    normalized_lower = normalized_model.lower()
                    for config_key, config in model_to_config.items():
                        config_key_lower = config_key.lower()
                        # Check if the requested model is contained in the config key
                        # e.g., "llama-3.1-8b" should match "together-ai/meta-llama/meta-llama-3.1-8b-instruct-turbo"
                        if normalized_lower in config_key_lower:
                            llm_config_dict = config
                            logger.info(f"  Found config via fuzzy match: '{normalized_model}' found in '{config_key}'")
                            break
                
                # Strategy 6: Token-based matching - match key components
                if not llm_config_dict:
                    # Extract key tokens from the requested model name
                    requested_tokens = set(re.findall(r'[a-z]+|\d+(?:\.\d+)?', normalized_model.lower()))
                    
                    best_match = None
                    best_match_score = 0
                    
                    for config_key in model_to_config.keys():
                        config_tokens = set(re.findall(r'[a-z]+|\d+(?:\.\d+)?', config_key.lower()))
                        # Calculate overlap
                        overlap = len(requested_tokens & config_tokens)
                        if overlap > best_match_score and overlap >= len(requested_tokens) * 0.7:  # At least 70% match
                            best_match = config_key
                            best_match_score = overlap
                    
                    if best_match:
                        llm_config_dict = model_to_config[best_match]
                        logger.info(f"  Found config via token matching: '{normalized_model}' matched '{best_match}' (score: {best_match_score})")
                
                logger.info(f"  Using config keys: {list(llm_config_dict.keys())}")
                
                llm_config_omega = OmegaConf.create(llm_config_dict)
                
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=LLMConfig.from_hydra_config(llm_config_omega),
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )
                
                await agent.build()
                await agent.reset()
                
                actual_model_name = "unknown"
                try:
                    actual_model_name = agent.config.llm_config.language_models[0].model_name if agent.config.llm_config.language_models else model_name
                except Exception:
                    actual_model_name = model_name
                
                self.agent_metadata[agent.name] = {
                    "model_name": actual_model_name,
                    "is_human": False
                }
                self.agent_name_map[agent.name] = agent
                
                logger.info(f"✓ Created LLM agent at position {agent_idx}: {agent.name} ({actual_model_name})")
            
            agents.append(agent)
        
        logger.info(f"Successfully created {len(agents)} agents ({human_count} human, {len(agents) - human_count} LLM)")
        logger.info(f"Agent order: {[a.name for a in agents]}")
        
        return agents
    
    def is_human_agent(self, agent_name: str) -> bool:
        """Helper method to check if an agent is human."""
        return agent_name in self.human_agent_names

    def _extract_llm_configs_from_hydra(self, hydra_cfg: Dict[str, Any], agent_models: List[str]) -> Dict[str, Any]:
        """Extract LLM configs for metadata storage."""
        llm_configs = {}
        model_counts = {}
        
        for model in agent_models:
            if model.lower() not in ['human-participant', 'human', 'mock/human']:
                if model not in model_counts:
                    model_counts[model] = 0
                model_counts[model] += 1
        
        # Map to llm1, llm2, llm3 format
        for idx, (model, count) in enumerate(model_counts.items(), 1):
            if idx <= 3:
                llm_key = f"llm{idx}"
                llm_configs[llm_key] = {
                    "model": model,
                    "count": count
                }
        
        return llm_configs

    async def _generate_agent_response(self, agent: BasicDebateAgent, timeout: int = 300) -> str:
        """Wrapper that handles both human and LLM agent response generation."""
        if self.is_human_agent(agent.name):
            response_text, extracted_answer = await self._wait_for_human_response(timeout)
            if hasattr(agent, "answer_history"):
                agent.answer_history.append(response_text)
            return response_text
        else:
            return await agent.generate_answer()

    async def _extract_agent_answer(self, agent: BasicDebateAgent, response_text: str) -> str:
        """Wrapper that handles both human and LLM agent answer extraction."""
        if self.is_human_agent(agent.name):
            return response_text
        else:
            return await agent.extract_answer_from_response(response_text)
                    
    async def _emit_progress(self, event_type: str, data: Dict[str, Any]):
        """Emit progress event for streaming."""
        event = {
            "type": event_type,
            "timestamp": time.time(),
            "data": data
        }
        if self.progress_queue:
            await self.progress_queue.put(json.dumps(event))
    
    async def _run_debate_round(
        self,
        question: str,
        question_prompt: Optional[str],
        round_number: int,
        skip_agent_index: Optional[int] = None
    ) -> DebateRound:
        """Execute a single debate round."""
        logger.info(f"=== STARTING ROUND {round_number} ===")
        logger.info(f"Skip agent index: {skip_agent_index}")
        
        current_round = DebateRound(round_number=round_number)
        
        if round_number > 0:
            async def add_discussion_with_semaphore(agent):
                async with self.semaphore:
                    other_answers = []
                    for a in self.agents:
                        if a != agent and hasattr(a, 'answer_history') and a.answer_history:
                            other_answers.append(a.answer_history[-1])
                    
                    if not other_answers:
                        logger.warning(f"No previous answers available for agent {agent.name}")
                        return
                    
                    return await agent.add_discussion_with_other_agents_in_context(
                        other_answers,
                        summarize=self.summarize,
                        additional_context=question_prompt
                            if self.task in ["math", "gsm8k"]
                            else None,
                    )
            
            discussion_tasks = [
                add_discussion_with_semaphore(agent) 
                for i, agent in enumerate(self.agents)
                if skip_agent_index is None or i != skip_agent_index
            ]
            await asyncio.gather(*discussion_tasks)
            
        async def generate_answer_with_semaphore(agent):
            async with self.semaphore:
                return await self._generate_agent_response(agent)
        
        answer_tasks = [
            generate_answer_with_semaphore(agent) 
            for i, agent in enumerate(self.agents)
            if skip_agent_index is None or i != skip_agent_index
        ]
        await asyncio.gather(*answer_tasks)
        
        # Collect responses using the unique agent names
        for i, agent in enumerate(self.agents):
            if skip_agent_index is None or i != skip_agent_index:
                response = agent.latest_response()
                current_round.add_response(agent.name, response)
                logger.info(f"Added response for agent {i} (name='{agent.name}')")
                logger.info(f"Response preview: {response[:100]}...")
        
        logger.info(f"=== ROUND {round_number} COMPLETE ===")
        logger.info(f"Collected responses from: {list(current_round.responses.keys())}")
        
        await self._emit_progress("round_completed", {
            "round_number": round_number,
            "responses": current_round.responses
        })
        
        return current_round

    async def _replay_round(
        self,
        question: str,
        question_prompt: Optional[str],
        round_number: int,
        human_agent_index: Optional[int] = None,
        previous_response: Optional[Dict[str, Any]] = None
    ) -> DebateRound:
        """
        Replay a single debate round, optionally using previous AI responses.
        
        Args:
            question: The question text
            question_prompt: Optional detailed question prompt
            round_number: Current round number (0-indexed)
            human_agent_index: Index of human agent if present
            previous_response: Previous round data with AI responses to restore
            
        Returns:
            DebateRound with responses from this round
        """
        logger.info(f"=== REPLAYING ROUND {round_number} ===")
        logger.info(f"Human agent index: {human_agent_index}")
        logger.info(f"Has previous response: {previous_response is not None}")
        
        current_round = DebateRound(round_number=round_number)
        
        # If we have previous responses, restore them to agent history
        if previous_response and round_number > 0:
            logger.info("Restoring previous round responses to agent history")
            
            # Extract responses from previous_response
            # Structure: {"agent_name": {"response": "...", "extracted_answer": "..."}}
            for agent in self.agents:
                agent_name = agent.name
                
                # Try to find this agent's previous response
                if agent_name in previous_response:
                    prev_resp = previous_response[agent_name].get("response", "")
                    if prev_resp and hasattr(agent, 'answer_history'):
                        agent.answer_history.append(prev_resp)
                        logger.info(f"Restored response for {agent_name}: {prev_resp[:100]}...")
                else:
                    # Try matching by agent type (e.g., gpt-3.5-turbo matches gpt_3_5_turbo_agent_0)
                    for prev_agent_name, prev_data in previous_response.items():
                        if prev_agent_name in agent_name or agent_name in prev_agent_name:
                            prev_resp = prev_data.get("response", "")
                            if prev_resp and hasattr(agent, 'answer_history'):
                                agent.answer_history.append(prev_resp)
                                logger.info(f"Restored response for {agent_name} (matched {prev_agent_name})")
                                break
        
        # Add discussion context if not the first round
        if round_number > 0:
            async def add_discussion_with_semaphore(agent):
                async with self.semaphore:
                    other_answers = []
                    for a in self.agents:
                        if a != agent and hasattr(a, 'answer_history') and a.answer_history:
                            other_answers.append(a.answer_history[-1])
                    
                    if not other_answers:
                        logger.warning(f"No previous answers available for agent {agent.name}")
                        return
                    
                    return await agent.add_discussion_with_other_agents_in_context(
                        other_answers,
                        summarize=self.summarize,
                        additional_context=question_prompt
                            if self.task in ["math", "gsm8k"]
                            else None,
                    )
            
            # Add discussion context for all agents
            discussion_tasks = [
                add_discussion_with_semaphore(agent) 
                for agent in self.agents
            ]
            await asyncio.gather(*discussion_tasks)
        
        # Generate new responses for this round
        # Human agent will be handled through the wait mechanism
        # AI agents generate their responses
        async def generate_answer_with_semaphore(agent):
            async with self.semaphore:
                return await self._generate_agent_response(agent)
        
        # Generate responses for all agents
        answer_tasks = [
            generate_answer_with_semaphore(agent) 
            for agent in self.agents
        ]
        await asyncio.gather(*answer_tasks)
        
        # Collect responses using the unique agent names
        for agent in self.agents:
            response = agent.latest_response()
            current_round.add_response(agent.name, response)
            logger.info(f"Added response for agent '{agent.name}'")
            logger.info(f"Response preview: {response[:100]}...")
        
        logger.info(f"=== REPLAY ROUND {round_number} COMPLETE ===")
        logger.info(f"Collected responses from: {list(current_round.responses.keys())}")
        
        await self._emit_progress("round_replayed", {
            "round_number": round_number,
            "responses": current_round.responses
        })
        
        return current_round

    async def _store_round(
        self, 
        round_data: DebateRound, 
        correct_answer: str,
        human_agent_index: Optional[int] = None,
        human_extracted_answer: Optional[str] = None
    ):
        """Store a debate round in the database with improved answer comparison."""
        logger.info(f"Round responses: {list(round_data.responses.keys())}")
        logger.info(f"Number of agents: {len(self.agents)}")
        logger.info(f"Correct answer: '{correct_answer}'")
        logger.info(f"Config agent_models: {self.config.get('agent_models') if self.config else 'No config'}")
        
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            if not self.current_question_session_id:
                if getattr(self, "custom_question_session_id", None):
                    self.current_question_session_id = self.custom_question_session_id
                    logger.info(f"Using custom_question_session_id={self.custom_question_session_id}")
                else:
                    logger.error("No valid question session ID found for storing round.")
                    return

            agent_answers = []
            extracted_answers_cache = {}
            
            for agent_idx, agent in enumerate(self.agents):
                logger.info(f"Processing agent {agent_idx}: name='{agent.name}'")
                
                if agent.name in round_data.responses:
                    response = round_data.responses[agent.name]
                    
                    if agent_idx == human_agent_index and human_extracted_answer:
                        extracted = human_extracted_answer
                    else:
                        extracted = await self._extract_agent_answer(agent, response)
                    
                    normalized_extracted = normalize_util(extracted) if extracted else ""
                    
                    extracted_answers_cache[agent.name] = {
                        'raw': extracted,
                        'normalized': normalized_extracted
                    }
                    
                    if normalized_extracted:
                        agent_answers.append(normalized_extracted)
                    
                    logger.info(f"  Agent {agent_idx} ({agent.name}):")
                    logger.info(f"    Raw extracted: '{extracted}'")
                    logger.info(f"    Normalized: '{normalized_extracted}'")
            
            majority_vote = 0.0
            if agent_answers:
                answer_counts = Counter(agent_answers)
                most_common_answer, most_common_count = answer_counts.most_common(1)[0]                
                is_majority_correct = answers_util(most_common_answer, correct_answer)                
                majority_vote = 1.0 if is_majority_correct else 0.0
            
            logger.info(f"Majority vote: {majority_vote}")
            logger.info(f"Normalized correct answer: '{normalize_util(correct_answer)}'")
            
            round_obj = await repo.create_round(
                question_session_id=self.current_question_session_id,
                round_number=round_data.round_number,
                majority_vote=majority_vote
            )
            
            stored_count = 0
            for agent_idx, agent in enumerate(self.agents):
                if agent.name in round_data.responses:
                    response_text = round_data.responses[agent.name]
                    answer_data = extracted_answers_cache.get(agent.name, {})
                    extracted_answer = answer_data.get('raw')
                    
                    is_correct = answers_util(extracted_answer, correct_answer) if extracted_answer else None
                    is_human = (agent_idx == human_agent_index)
                    
                    logger.info(f"  Agent {agent_idx} correctness check:")
                    logger.info(f"    Agent name: '{agent.name}'")
                    logger.info(f"    Extracted: '{extracted_answer}'")
                    logger.info(f"    Correct answer: '{correct_answer}'")
                    logger.info(f"    Is correct: {is_correct}")
                    
                    # FIX: Properly determine model name from config
                    model_name = None
                    
                    # Strategy 1: Use agent_models from config (MOST RELIABLE)
                    if self.config and 'agent_models' in self.config:
                        agent_models = self.config['agent_models']
                        logger.info(f"    agent_models list: {agent_models}")
                        logger.info(f"    Looking up index {agent_idx} in agent_models")
                        
                        if agent_idx < len(agent_models):
                            raw_model = agent_models[agent_idx]
                            logger.info(f"    raw_model from config: '{raw_model}'")
                            
                            # Normalize the model name (convert underscores to hyphens)
                            if raw_model.lower() in ['human-participant', 'human', 'mock/human']:
                                model_name = "human"
                            else:
                                # Convert gpt_3_5_turbo -> gpt-3.5-turbo, gpt_4o_mini -> gpt-4o-mini
                                model_name = raw_model.replace('_', '-')
                            
                            logger.info(f"    Normalized model name: '{model_name}'")
                    else:
                        logger.warning(f"    No agent_models in config!")
                    
                    # Strategy 2: Check if human from metadata
                    if not model_name and is_human:
                        model_name = "human"
                        logger.info(f"    Detected as human agent via human_agent_index")
                    
                    # Strategy 3: Use metadata if available
                    if not model_name:
                        metadata = self.agent_metadata.get(agent.name, {})
                        model_name = metadata.get('model_name')
                        if model_name:
                            logger.info(f"    Retrieved model from metadata: '{model_name}'")
                    
                    # Strategy 4: Extract from agent config
                    if not model_name or model_name == "unknown":
                        try:
                            if agent.config.llm_config and agent.config.llm_config.language_models:
                                model_name = agent.config.llm_config.language_models[0].model_name
                                logger.info(f"    Retrieved model from agent.config.llm_config: '{model_name}'")
                        except Exception as e:
                            logger.warning(f"    Failed to extract model from agent config: {e}")
                    
                    # Final fallback
                    if not model_name:
                        model_name = "unknown"
                        logger.warning(f"    Could not determine model name for agent {agent_idx}, using 'unknown'")
                    
                    logger.info(f"  *** FINAL model_name for agent {agent_idx}: '{model_name}' ***")
                    
                    await repo.create_agent_response(
                        round_id=round_obj.id,
                        agent_index=agent_idx,
                        response_text=response_text,
                        extracted_answer=extracted_answer,
                        is_correct=is_correct,
                        model_name=model_name,
                        is_human=is_human
                    )
                    
                    stored_count += 1
                    logger.info(f"✓ Stored response for agent {agent_idx} with model_name='{model_name}' - correct: {is_correct}")
                else:
                    logger.warning(f"No response found for agent {agent_idx} (name='{agent.name}')")

    async def _create_question_session(
        self, 
        question: str, 
        answer: str, 
        question_prompt: Optional[str]
    ):
        """Create a question session in the database."""
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            
            import hashlib
            unique_str = f"{self.debate_id}_{self.current_question_index}_{question}_{answer}"
            hash_value = int(hashlib.sha256(unique_str.encode()).hexdigest()[:8], 16)
            question_id = hash_value % 2147483647
            
            logger.info(f"Creating question with ID: {question_id}")
            
            question_obj = await repo.get_or_create_question(
                question_id=question_id,
                question_text=question,
                correct_answer=str(answer),
                question_prompt=question_prompt
            )
            
            await session.commit()
            await session.refresh(question_obj)
            
            logger.info(f"Question object created/retrieved: ID={question_obj.id}")
            
            question_session = await repo.create_question_session(
                debate_id=self.debate_id,
                question_id=question_obj.id,
                total_rounds=self.num_rounds
            )
            
            await session.commit()
            await session.refresh(question_session)
            
            self.current_question_session_id = question_session.id
            
            logger.info(f"Question session created: ID={question_session.id}")
            
            return question_session


    async def _create_question_session_with_record(
        self,
        question_record,
        answer: str
    ):
        """
        Create a question session using an already-fetched question record.
        This is preferred when you've already loaded the question from the database.
        """
        logger.info(f"Creating question session for question ID: {question_record.id}")
        
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            
            question_session = await repo.create_question_session(
                debate_id=self.debate_id,
                question_id=question_record.id,
                total_rounds=self.num_rounds
            )
            
            session_id = question_session.id
            
            if session_id is None:
                raise RuntimeError("Question session ID is None after creation")
            
            self.current_question_session_id = session_id
            
            logger.info(f"Question session created: ID={session_id} for question UUID={question_record.id}")
        
        return question_session
    async def _complete_question_session(self):
        """Mark current question session as completed."""
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            
            await repo.complete_question_session(
                session_id=self.current_question_session_id
            )
            
            await repo.update_debate_progress(
                debate_id=self.debate_id,
                completed_questions=self.current_question_index + 1
            )
        
        self.current_question_index += 1
    
    async def _complete_debate(self):
        """Mark the entire debate as completed and calculate performance data."""
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            await self._calculate_and_store_performance(repo)

    async def _calculate_and_store_performance(self, repo: DebateRepository):
        """Helper to calculate and store performance data."""
        debate = await repo.get_debate_with_sessions(self.debate_id)
        if not debate:
            logger.error(f"Debate {self.debate_id} not found for performance calculation")
            return
        
        round_performances = {}        
        round_distribution = {}
        
        # Track model counts to reconstruct agent names correctly
        model_index_map = {}  # Maps (round_num, model_name) -> local_index
        
        for question_session in debate.question_sessions:
            for round_obj in question_session.rounds:
                round_num = round_obj.round_number
                
                display_round_num = round_num + 1
                
                round_distribution[round_num] = round_distribution.get(round_num, 0) + 1

                if round_num < 0:
                    logger.warning(f"Invalid round number {round_num} for debate {self.debate_id}, skipping")
                    continue

                if display_round_num not in round_performances:
                    round_performances[display_round_num] = {}
                
                round_perf = round_performances[display_round_num]
                
                round_perf.setdefault("majority_vote", []).append(round_obj.majority_vote)
                
                logger.info(f"Processing round {round_num}, {len(round_obj.agent_response_records)} responses")
                
                # Reset model counters for each round to properly reconstruct agent names
                round_model_counts = {}
                
                # First pass: build the mapping of agent_index -> agent_name by counting models
                # Sort by agent_index to maintain order
                sorted_responses = sorted(round_obj.agent_response_records, key=lambda r: r.agent_index)
                
                for response in sorted_responses:
                    model_name = response.model_name
                    
                    # Track count for this model in this round
                    if model_name not in round_model_counts:
                        round_model_counts[model_name] = 0
                    
                    local_index = round_model_counts[model_name]
                    round_model_counts[model_name] += 1
                    
                    # Reconstruct the agent key that matches what's stored
                    # This should match the format from _store_round
                    if response.is_human:
                        agent_key = f"human_agent_{local_index}"
                    else:
                        agent_key = f"{model_name}_agent_{local_index}"
                    
                    logger.info(f"  Response: agent_index={response.agent_index}, model_name='{model_name}', "
                            f"is_human={response.is_human}, is_correct={response.is_correct}")
                    logger.info(f"  Reconstructed agent_key: '{agent_key}'")
                    
                    round_perf.setdefault(agent_key, [])
                    if response.is_correct is not None:
                        round_perf[agent_key].append(1 if response.is_correct else 0)
        
        logger.info(f"Round distribution in database (0-based): {round_distribution}")
        logger.info(f"Total question sessions: {len(debate.question_sessions)}")
        logger.info(f"Expected rounds per question: {self.num_rounds}")
        logger.info(f"Display rounds found: {sorted(round_performances.keys())}")
        logger.info(f"Round performances before formatting: {round_performances}")

        formatted_performance = []
        for display_round_num in sorted(round_performances.keys()):
            round_perf = round_performances[display_round_num]
            round_data = {}
            for key, values in round_perf.items():
                if values:
                    avg_value = sum(values) / len(values)
                    round_data[key] = round(avg_value, 2)
            if round_data:
                formatted_performance.append({f"round_{display_round_num}": round_data})

        performance_data = formatted_performance

        logger.info(
            f"Calculated performance data for debate {self.debate_id}: {performance_data}"
        )

        await repo.update_debate_performance_data(self.debate_id, performance_data)
        await repo.complete_debate(self.debate_id)

        await self._emit_progress("debate_completed", {
            "debate_id": str(self.debate_id),
            "total_questions": len(self.questions),
            "performance_data": performance_data
        })

        logger.info(
            f"Debate {self.debate_id} completed with {len(formatted_performance)} rounds of performance data"
        )
    def get_status(self) -> Dict[str, Any]:
        """Get current status of the debate."""
        return {
            "debate_id": str(self.debate_id),
            "status": self.status,
            "current_question_index": self.current_question_index,
            "total_questions": len(self.questions),
            "current_round": self.current_round,
            "total_rounds": self.num_rounds,
            "num_agents": len(self.agents)
        }

    async def _wait_for_human_response(self, timeout: int = 300) -> tuple[str, Optional[str]]:
        logger.info(f"Waiting for human response (timeout={timeout}s)...")
        
        try:
            response_text, extracted_answer = await asyncio.wait_for(
                self.human_response_queue.get(),
                timeout=timeout
            )
            
            logger.info(f"Received human response: {response_text[:100]}...")
            
            return response_text, extracted_answer
            
        except asyncio.TimeoutError:
            logger.error(f"Timeout waiting for human response after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Error waiting for human response: {e}", exc_info=True)
            raise