# src/debates/basic_debate.py
import asyncio
import logging
import uuid
import json
from typing import List, Optional, Dict, Any
from collections import Counter
import time
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
        
        await self._store_wandb_metadata(hydra_cfg, num_agents)
        
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
            'gpt_4o_mini': hydra_cfg.get("llm1") or {},
            'gpt_4o': hydra_cfg.get("llm2") or {},
            'claude_sonnet': hydra_cfg.get("llm3") or {},
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

    
    async def _store_wandb_metadata(self, hydra_cfg: Dict[str, Any], num_agents: int):
        """Store wandb metadata in database."""
        try:
            wandb_metadata = {
                "startedAt": datetime.utcnow().isoformat(),
                "parsed_args": {
                    "seed": str(hydra_cfg.get("seed", 0)),
                    "task": self.task,
                    "debug": hydra_cfg.get("debug", False),
                    "cost_check": hydra_cfg.get("cost_check", False),
                    "agent_counts.0": num_agents,
                    "agent_counts.1": 0,
                    "experiment.name": hydra_cfg.get("experiment", {}).get("name", "unknown"),
                    "experiment.num_rounds": self.num_rounds,
                    "experiment.num_questions": len(self.questions)
                }
            }
            
            async with self.db_manager.get_session() as session:
                repo = DebateRepository(session)
                await repo.update_wandb_metadata(self.debate_id, wandb_metadata)
            
            logger.info(f"Stored wandb metadata for debate {self.debate_id}")
        except Exception as e:
            logger.error(f"Failed to store wandb metadata: {e}", exc_info=True)

    async def _create_agents_from_hydra(
        self,
        hydra_cfg: Dict[str, Any],
        num_agents: int
    ) -> List[BasicDebateAgent]:
        """Create agents directly from Hydra config with unique identifiers."""
        
        task_config = hydra_cfg.get("task", {})
        task = task_config.get("name", "unknown")
        
        agent_types = hydra_cfg.get("agent_types", [])
        
        logger.info(f"Agent types from config: {len(agent_types)} types")
        
        if not agent_types:
            agent_counts = hydra_cfg.get("agent_counts", [num_agents, 0, 0])
            agent_prompts = hydra_cfg.get("agent_prompts") or {}
            task_partials = hydra_cfg.get("task", {}).get("partials") or {}
            
            basic_agent_config = hydra_cfg.get("basic_agent") or {}
            llm1_config = hydra_cfg.get("llm1") or {}
            llm2_config = hydra_cfg.get("llm2") or {}
            llm3_config = hydra_cfg.get("llm3") or {}
            
            if agent_counts[0] > 0:
                prompts = {
                    "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant."),
                    "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
                }
                agent_types.append({
                    "name": basic_agent_config.get("name", "basic_agent"),
                    "count": agent_counts[0],
                    "prompts": prompts,
                    "llm_config": llm1_config
                })
            
            if len(agent_counts) > 1 and agent_counts[1] > 0:
                prompts = {
                    "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant."),
                    "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
                }
                agent_types.append({
                    "name": "background_agent",
                    "count": agent_counts[1],
                    "prompts": prompts,
                    "llm_config": llm2_config
                })
            
            if len(agent_counts) > 2 and agent_counts[2] > 0:
                prompts = {
                    "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant."),
                    "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
                }
                agent_types.append({
                    "name": "third_agent",
                    "count": agent_counts[2],
                    "prompts": prompts,
                    "llm_config": llm3_config
                })
            
            logger.info(f"Constructed {len(agent_types)} agent types manually")
        
        agent_configs = []
        for agent_type in agent_types:
            count = agent_type.get("count", 0)
            for i in range(count):
                agent_configs.append({
                    "name": f"{agent_type.get('name', 'agent')}_{i}",
                    "prompts": agent_type.get("prompts", {}),
                    "llm_config": agent_type.get("llm_config", {}),
                })
        
        logger.info(f"Created {len(agent_configs)} agent configs for {num_agents} agents")
        
        agents = []
        model_name_counts = {}
        
        for i in range(min(num_agents, len(agent_configs))):
            prompts = agent_configs[i]["prompts"]
            llm_config_dict = agent_configs[i]["llm_config"]
            agent_name = agent_configs[i]["name"]
            
            is_human_agent = False
            model_field = ""
            api_base_field = ""
            try:
                litellm_params = llm_config_dict.get("litellm_params") or {}
                model_field = litellm_params.get("model", "") or ""
                api_base_field = litellm_params.get("api_base", "") or ""
                if model_field.lower().startswith("mock/human") or api_base_field == "none":
                    is_human_agent = True
            except Exception:
                pass
            
            if is_human_agent:
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=None,
                        name=agent_name,
                    ),
                    num_agents=num_agents,
                    domain=task,
                    debug=False,
                )

                await agent.build()
                await agent.reset()

                self.human_agent_names.add(agent.name)
                self.human_agent_name = agent.name
                self.agent_metadata[agent.name] = {
                    "model_name": "human", 
                    "is_human": True,
                    "agent_instance": agent
                }
                self.agent_name_map[agent.name] = agent
                logger.info(f"Registered human agent: name='{agent.name}' (skipped LLM init)")

                agents.append(agent)
                continue

            llm_config_omega = OmegaConf.create(llm_config_dict)
            
            try:
                temp_llm_config = LLMConfig.from_hydra_config(llm_config_omega)
                potential_model_name = temp_llm_config.language_models[0].model_name if temp_llm_config.language_models else ""
                if potential_model_name and ("human" in potential_model_name.lower() or "mock/human" in potential_model_name.lower()):
                    is_human_agent = True
            except Exception:
                pass
            
            if is_human_agent:
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt", "You are a helpful assistant."),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=None,
                        name=agent_name,
                    ),
                    num_agents=num_agents,
                    domain=task,
                    debug=False,
                )
                
                await agent.build()
                await agent.reset()
                
                self.human_agent_names.add(agent.name)
                self.human_agent_name = agent.name
                self.agent_metadata[agent.name] = {
                    "model_name": "human", 
                    "is_human": True,
                    "agent_instance": agent
                }
                self.agent_name_map[agent.name] = agent
                logger.info(f"Registered human agent (late detection): name='{agent.name}'")
                
                agents.append(agent)
                continue
            
            agent = BasicDebateAgent(
                config=AgentConfig(
                    prompt_config=PromptConfig(
                        system_prompt=prompts.get("system_prompt", "You are a helpful assistant that can answer questions and provide helpful information."),
                        partials=prompts.get("partials", {}),
                    ),
                    llm_config=LLMConfig.from_hydra_config(llm_config_omega),
                    name=agent_name,
                ),
                num_agents=num_agents,
                domain=task,
                debug=False,
            )
            
            await agent.build()
            await agent.reset()
            
            model_name = "unknown"
            try:
                model_name = agent.config.llm_config.language_models[0].model_name if agent.config.llm_config.language_models else "unknown"
            except Exception:
                pass
            
            if model_name not in model_name_counts:
                model_name_counts[model_name] = 0
            model_name_counts[model_name] += 1
            
            self.agent_metadata[agent.name] = {
                "model_name": model_name,
                "is_human": False
            }
            self.agent_name_map[agent.name] = agent
            logger.info(f"Registered LLM agent: name='{agent.name}', model='{model_name}'")
            
            agents.append(agent)
        
        num_human = len(self.human_agent_names)
        num_llm = len(agents) - num_human
        logger.info(f"Successfully created {len(agents)} agents ({num_human} human, {num_llm} LLM)")
        return agents
    
    def is_human_agent(self, agent_name: str) -> bool:
        """Helper method to check if an agent is human."""
        return agent_name in self.human_agent_names

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
                    logger.info(f"    Extracted: '{extracted_answer}'")
                    logger.info(f"    Correct answer: '{correct_answer}'")
                    logger.info(f"    Is correct: {is_correct}")
                    
                    metadata = self.agent_metadata.get(agent.name, {})
                    if is_human:
                        model_name = "human"
                    else:
                        model_name = metadata.get('model_name')
                        if not model_name:
                            # Fallback to extracting from config
                            model_name = agent.config.llm_config.language_models[0].model_name if agent.config.llm_config.language_models else "unknown"
                    
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
                    logger.info(f"Stored response for agent {agent_idx} ({model_name}) - correct: {is_correct}")
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
                
                for response in round_obj.agent_response_records:
                    agent_key = f"{response.model_name}_agent_{response.agent_index}"
                    round_perf.setdefault(agent_key, [])
                    if response.is_correct is not None:
                        round_perf[agent_key].append(1 if response.is_correct else 0)
        
        logger.info(f"Round distribution in database (0-based): {round_distribution}")
        logger.info(f"Total question sessions: {len(debate.question_sessions)}")
        logger.info(f"Expected rounds per question: {self.num_rounds}")
        logger.info(f"Display rounds found: {sorted(round_performances.keys())}")

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