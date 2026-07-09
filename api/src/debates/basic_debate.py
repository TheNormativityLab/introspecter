import asyncio
import logging
import uuid
import json
import time
import re
import hashlib
import yaml
from pathlib import Path
from typing import List, Optional, Dict, Any
from collections import Counter
from omegaconf import OmegaConf, DictConfig, ListConfig
from src.agents.base_agent import AgentConfig
from src.agents.debate.basic_debate_agent import BasicDebateAgent
from src.llm_api import PromptConfig, LLMConfig
from src.environments.debate.utils import _normalize_answer as normalize_util
from src.environments.debate.utils import _answers_match as answers_util
from src.environments.debate.adts import DebateResult, DebateRound
from src.database.database import DatabaseManager
from src.database.repository import DebateRepository

logger = logging.getLogger(__name__)

RE_FINAL_ANSWER_HASH = re.compile(r'####\s*([+-]?\d+\.?\d*)')
RE_FINAL_ANSWER_PAREN_X_1 = re.compile(r'\(X\)\s*([A-E])\)', re.IGNORECASE)
RE_FINAL_ANSWER_PAREN_X_2 = re.compile(r'\(X\)\s*\(([A-E])\)', re.IGNORECASE)
RE_FINAL_ANSWER_PAREN_X_3 = re.compile(r'\(X\)\s*([A-E])(?:\s|$)', re.IGNORECASE)
RE_BOXED = re.compile(r'\\boxed\{([^}]+)\}')
RE_TEXT_PATTERNS = [
    re.compile(r'(?:the )?(?:final )?answer is[:\s]+\(?([A-E])\)?', re.IGNORECASE),
    re.compile(r'(?:the )?(?:final )?answer is[:\s]+([^\n\.]+)', re.IGNORECASE),
    re.compile(r'(?:equals?|is|=)\s*([+-]?\d+\.?\d*)', re.IGNORECASE),
    re.compile(r'(?:therefore|thus|so)[,\s]+(?:the answer is )?\s*([^\n\.]+)', re.IGNORECASE),
    re.compile(r'\(([A-E])\)\s*$', re.IGNORECASE),
    re.compile(r'([+-]?\d+\.?\d*)\s*$', re.IGNORECASE),
]
RE_NORMALIZE_HYPHEN = re.compile(r'-(\d+)-(\d+)-')

LEGACY_MODEL_MAPPING = {
    "human": "human_participant",
    "human-participant": "human_participant",
    "mock/human": "human_participant",
}


def _deep_convert_to_python(obj: Any) -> Any:
    if isinstance(obj, DictConfig):
        return {k: _deep_convert_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, ListConfig):
        return [_deep_convert_to_python(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: _deep_convert_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_deep_convert_to_python(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(_deep_convert_to_python(item) for item in obj)
    else:
        return obj


def map_legacy_model(model_name: str, available_configs: List[str] = None) -> str:
    if not model_name:
        return model_name

    if model_name in LEGACY_MODEL_MAPPING:
        mapped = LEGACY_MODEL_MAPPING[model_name]
        logger.info(f"Mapping legacy model '{model_name}' to '{mapped}'")
        return mapped

    normalized = model_name.lower().strip().replace("-", "_").replace(".", "_")

    if normalized in LEGACY_MODEL_MAPPING:
        mapped = LEGACY_MODEL_MAPPING[normalized]
        logger.info(f"Mapping legacy model '{model_name}' to '{mapped}'")
        return mapped

    if available_configs:
        if model_name in available_configs:
            return model_name

        config_lower_map = {c.lower(): c for c in available_configs}
        if normalized in config_lower_map:
            matched = config_lower_map[normalized]
            logger.info(f"Case-insensitive match: '{model_name}' -> '{matched}'")
            return matched

        for config in available_configs:
            config_normalized = config.lower().replace("-", "_").replace(".", "_")
            if config_normalized == normalized:
                logger.info(f"Normalized match: '{model_name}' -> '{config}'")
                return config

        keywords = set(normalized.split("_"))
        best_match = None
        best_score = 0

        for config_name in available_configs:
            config_normalized = config_name.lower().replace("-", "_").replace(".", "_")
            config_keywords = set(config_normalized.split("_"))

            overlap = len(keywords & config_keywords)
            if overlap > best_score:
                best_score = overlap
                best_match = config_name

        if best_score >= 2 and best_match:
            logger.info(f"Found similar model for '{model_name}': '{best_match}' (score: {best_score})")
            return best_match

    logger.warning(f"No config match found for '{model_name}', returning as-is")
    return model_name


def normalize_model_name(model_name: str) -> str:
    if not model_name:
        return ""
    normalized = model_name.lower().strip()
    if normalized in {'human-participant', 'human', 'mock/human', 'human_participant'}:
        return 'human-participant'
    normalized = normalized.replace('_', '-').replace('.', '-').replace('/', '-')
    normalized = re.sub(r'-+', '-', normalized).strip('-')
    return normalized


def normalize_for_matching(name: str) -> str:
    if not name:
        return ""
    normalized = name.lower().strip()
    normalized = normalized.replace('_', '-').replace('.', '-').replace(' ', '-').replace('/', '-')
    normalized = re.sub(r'[^a-z0-9-]', '', normalized)
    normalized = re.sub(r'-+', '-', normalized)
    normalized = normalized.strip('-')
    return normalized


def get_llm_conf_directory() -> Path:
    possible_paths = [
        Path("conf/llm_conf"),
        Path("../conf/llm_conf"),
        Path(__file__).parent.parent.parent / "conf" / "llm_conf",
        Path("/app/src/conf/llm_conf"),
    ]
    for path in possible_paths:
        if path.exists() and path.is_dir():
            return path
    raise FileNotFoundError("Could not find conf/llm_conf directory")


def get_available_config_names() -> List[str]:
    try:
        llm_conf_dir = get_llm_conf_directory()
        configs = []
        for file_path in llm_conf_dir.glob("*.yaml"):
            configs.append(file_path.stem)
        for file_path in llm_conf_dir.glob("*.yml"):
            configs.append(file_path.stem)
        return configs
    except FileNotFoundError:
        return []


def load_llm_config_by_name(config_name: str) -> Dict[str, Any]:
    available_configs = get_available_config_names()
    mapped_name = map_legacy_model(config_name, available_configs)

    try:
        llm_conf_dir = get_llm_conf_directory()
    except FileNotFoundError:
        raise FileNotFoundError(f"Could not find LLM config: {config_name}")

    for ext in [".yaml", ".yml"]:
        file_path = llm_conf_dir / f"{mapped_name}{ext}"
        if file_path.exists():
            with open(file_path, 'r') as f:
                config = yaml.safe_load(f)
                return _deep_convert_to_python(config)

    normalized_request = normalize_for_matching(mapped_name)
    for file_path in llm_conf_dir.glob("*.yaml"):
        if normalize_for_matching(file_path.stem) == normalized_request:
            with open(file_path, 'r') as f:
                config = yaml.safe_load(f)
                return _deep_convert_to_python(config)

    for file_path in llm_conf_dir.glob("*.yml"):
        if normalize_for_matching(file_path.stem) == normalized_request:
            with open(file_path, 'r') as f:
                config = yaml.safe_load(f)
                return _deep_convert_to_python(config)

    raise FileNotFoundError(f"Could not find LLM config: {config_name} (mapped to: {mapped_name}). Available: {available_configs}")


def get_available_llm_configs() -> List[Dict[str, Any]]:
    try:
        llm_conf_dir = get_llm_conf_directory()
    except FileNotFoundError:
        return []

    configs = []
    for file_path in sorted(llm_conf_dir.glob("*.yaml")):
        try:
            with open(file_path, 'r') as f:
                config = yaml.safe_load(f)
            if config and "language_models" in config:
                lm = config["language_models"][0] if config["language_models"] else {}
                model_ref = (lm.get("litellm_params", {}).get("model", "") or lm.get("model_name", "")).lower()
                if model_ref in ("mock/human", "human", "human-participant"):
                    continue
                config_info = {
                    "config_name": file_path.stem,
                    "file_path": str(file_path),
                    "config_data": _deep_convert_to_python(config)
                }
                configs.append(config_info)
        except Exception as e:
            logger.warning(f"Failed to load config {file_path}: {e}")

    for file_path in sorted(llm_conf_dir.glob("*.yml")):
        try:
            with open(file_path, 'r') as f:
                config = yaml.safe_load(f)
            if config and "language_models" in config:
                config_info = {
                    "config_name": file_path.stem,
                    "file_path": str(file_path),
                    "config_data": _deep_convert_to_python(config)
                }
                configs.append(config_info)
        except Exception as e:
            logger.warning(f"Failed to load config {file_path}: {e}")

    return configs


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
        self.available_llm_configs: List[Dict[str, Any]] = []
        self.config_lookup: Dict[str, Dict[str, Any]] = {}
        self.available_config_names: List[str] = []

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
        self.debate_id = debate_id
        self.questions = questions
        self.num_rounds = num_rounds
        self.summarize = summarize
        self.hydra_cfg = _deep_convert_to_python(hydra_cfg)
        self.task = self.hydra_cfg.get("task", {}).get("name", "unknown") if isinstance(self.hydra_cfg.get("task"), dict) else "unknown"
        self.available_llm_configs = get_available_llm_configs()
        self.available_config_names = get_available_config_names()
        self._build_config_lookup()

        mapped_agent_models = [
            map_legacy_model(m, self.available_config_names) for m in agent_models
        ]
        logger.info(f"Original models: {agent_models}")
        logger.info(f"Mapped models: {mapped_agent_models}")

        self.config = {
            "task": self.task,
            "num_agents": num_agents,
            "num_rounds": num_rounds,
            "summarize": summarize,
            "agent_models": mapped_agent_models,
            "original_agent_models": agent_models,
        }

        self.db_manager = DatabaseManager()
        self.semaphore = asyncio.Semaphore(num_agents)

        self.agents = await self._create_agents_from_models(self.hydra_cfg, mapped_agent_models)

        self.progress_queue = asyncio.Queue()
        from src.api.tasks import store_wandb_metadata
        await store_wandb_metadata(
            str(debate_id),
            {
                "task": self.task,
                "num_rounds": num_rounds,
                "num_questions": len(questions),
                "agent_models": mapped_agent_models,
                "original_agent_models": agent_models,
                "llm_configs": self._extract_llm_configs_from_hydra(self.hydra_cfg, mapped_agent_models)
            },
            self.hydra_cfg
        )

        self.status = "ready"
        logger.info(f"Initialized debate {debate_id}")

    async def initialize_for_replay(
        self,
        debate_id: uuid.UUID,
        original_config: Dict[str, Any],
        questions: List[Dict[str, Any]],
        num_rounds: int,
        start_from_round: int,
        previous_rounds: List[Dict[str, Any]],
        replace_agent_index: Optional[int] = None,
        replace_agent_name: Optional[str] = None,
        summarize: bool = True
    ):
        self.debate_id = debate_id
        self.questions = questions
        self.num_rounds = num_rounds
        self.summarize = summarize
        self.available_llm_configs = get_available_llm_configs()
        self.available_config_names = get_available_config_names()
        self._build_config_lookup()

        original_agent_models = original_config.get("agent_models", [])
        mapped_agent_models = [
            map_legacy_model(m, self.available_config_names) for m in original_agent_models
        ]

        logger.info(f"Replay - Original models: {original_agent_models}")
        logger.info(f"Replay - Mapped models: {mapped_agent_models}")

        if replace_agent_index is not None and replace_agent_name:
            mapped_replace_name = map_legacy_model(replace_agent_name, self.available_config_names)
            if replace_agent_index < len(mapped_agent_models):
                mapped_agent_models[replace_agent_index] = mapped_replace_name
                logger.info(f"Replaced agent {replace_agent_index} with {mapped_replace_name}")

        self.task = original_config.get("task", "unknown")
        if isinstance(self.task, dict):
            self.task = self.task.get("name", "unknown")

        self.config = {
            "task": self.task,
            "num_agents": len(mapped_agent_models),
            "num_rounds": num_rounds,
            "summarize": summarize,
            "agent_models": mapped_agent_models,
            "original_agent_models": original_agent_models,
            "is_replay": True,
            "start_from_round": start_from_round,
            "replace_agent_index": replace_agent_index,
            "replace_agent_name": replace_agent_name,
        }

        self.db_manager = DatabaseManager()
        self.semaphore = asyncio.Semaphore(len(mapped_agent_models))

        self.hydra_cfg = {
            "task": {"name": self.task},
            "agent_prompts": original_config.get("agent_prompts", {}),
        }

        self.agents = await self._create_agents_from_models(self.hydra_cfg, mapped_agent_models)

        if previous_rounds:
            await self._inject_previous_rounds(previous_rounds)

        self.progress_queue = asyncio.Queue()
        self.status = "ready"
        logger.info(f"Initialized replay debate {debate_id} starting from round {start_from_round}")

    async def _inject_previous_rounds(self, previous_rounds: List[Dict[str, Any]]):
        for round_data in previous_rounds:
            round_num = round_data.get("round_number", 0)
            responses = round_data.get("responses", {})

            for agent in self.agents:
                agent_response = None

                if agent.name in responses:
                    agent_response = responses[agent.name]
                else:
                    for resp_name, resp_data in responses.items():
                        if agent.name in resp_name or resp_name in agent.name:
                            agent_response = resp_data
                            break
                        agent_model = agent.name.rsplit('_agent_', 1)[0] if '_agent_' in agent.name else agent.name
                        resp_model = resp_name.rsplit('_agent_', 1)[0] if '_agent_' in resp_name else resp_name
                        if normalize_for_matching(agent_model) == normalize_for_matching(resp_model):
                            agent_response = resp_data
                            break

                if agent_response:
                    response_text = agent_response if isinstance(agent_response, str) else agent_response.get("response", "")
                    if response_text and hasattr(agent, 'answer_history'):
                        agent.answer_history.append(response_text)
                        logger.debug(f"Injected round {round_num} response for {agent.name}")

    def _build_config_lookup(self):
        self.config_lookup = {}

        for config_info in self.available_llm_configs:
            config_name = config_info["config_name"]
            config_data = _deep_convert_to_python(config_info["config_data"])

            self.config_lookup[config_name] = config_data

            normalized = normalize_for_matching(config_name)
            self.config_lookup[normalized] = config_data

            model_name = self._extract_model_name_from_config(config_data)
            if model_name:
                self.config_lookup[model_name] = config_data
                self.config_lookup[normalize_for_matching(model_name)] = config_data

        logger.info(f"Built config lookup with {len(self.config_lookup)} entries")

    def _find_config_for_model(self, model_name: str) -> Optional[Dict[str, Any]]:
        mapped_name = map_legacy_model(model_name, self.available_config_names)

        if mapped_name in self.config_lookup:
            return _deep_convert_to_python(self.config_lookup[mapped_name])

        normalized = normalize_for_matching(mapped_name)
        if normalized in self.config_lookup:
            return _deep_convert_to_python(self.config_lookup[normalized])

        for key, config in self.config_lookup.items():
            if normalize_for_matching(key) == normalized:
                return _deep_convert_to_python(config)

        for key, config in self.config_lookup.items():
            key_norm = normalize_for_matching(key)
            if key_norm in normalized or normalized in key_norm:
                return _deep_convert_to_python(config)

        model_parts = set(normalized.replace('-', ' ').split())
        best_match = None
        best_score = 0

        for key, config in self.config_lookup.items():
            key_parts = set(normalize_for_matching(key).replace('-', ' ').split())
            overlap = len(model_parts & key_parts)
            if overlap > best_score:
                best_score = overlap
                best_match = config

        if best_score >= 2:
            return _deep_convert_to_python(best_match)

        return None

    def _extract_model_name_from_config(self, config: Dict[str, Any]) -> Optional[str]:
        config = _deep_convert_to_python(config)
        if "language_models" in config:
            lang_models = config["language_models"]
            if lang_models and len(lang_models) > 0:
                first_model = lang_models[0]
                if "litellm_params" in first_model:
                    return first_model["litellm_params"].get("model")
                return first_model.get("model_name")
        if "litellm_params" in config:
            return config["litellm_params"].get("model")
        return config.get("model") or config.get("modelName")

    async def _create_agents_from_models(
        self,
        hydra_cfg: Dict[str, Any],
        agent_models: List[str]
    ) -> List[BasicDebateAgent]:
        hydra_cfg = _deep_convert_to_python(hydra_cfg)
        task_config = hydra_cfg.get("task", {})
        task = task_config.get("name", "unknown") if isinstance(task_config, dict) else "unknown"

        agent_prompts = hydra_cfg.get("agent_prompts") or {}
        task_partials = hydra_cfg.get("task", {}).get("partials") or {} if isinstance(hydra_cfg.get("task"), dict) else {}

        prompts = {
            "system_prompt": agent_prompts.get("system_prompt", "You are a helpful assistant that can answer questions and provide helpful information."),
            "partials": {**(agent_prompts.get("partials") or {}), **task_partials},
        }

        for i in range(1, 4):
            llm_key = f"llm{i}"
            if llm_key in hydra_cfg and hydra_cfg[llm_key]:
                llm_config = _deep_convert_to_python(hydra_cfg[llm_key])
                model_name = self._extract_model_name_from_config(llm_config)
                if model_name:
                    self.config_lookup[model_name] = llm_config
                    self.config_lookup[normalize_for_matching(model_name)] = llm_config

        agents = []
        human_count = 0

        for agent_idx, model_name in enumerate(agent_models):
            mapped_model = map_legacy_model(model_name, self.available_config_names)
            is_human = normalize_model_name(mapped_model) == 'human-participant'

            if is_human:
                agent_name = f"human_agent_{human_count}"
                human_count += 1

                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt"),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=None,
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )
                self.human_agent_names.add(agent.name)
                self.human_agent_name = agent.name
                self.agent_metadata[agent.name] = {
                    "model_name": "human",
                    "is_human": True,
                    "original_model": model_name,
                    "mapped_model": mapped_model,
                    "agent_instance": agent
                }
            else:
                agent_name = f"{mapped_model}_agent_{agent_idx}"

                llm_config_dict = self._find_config_for_model(mapped_model)

                if not llm_config_dict:
                    try:
                        llm_config_dict = load_llm_config_by_name(mapped_model)
                    except FileNotFoundError:
                        pass

                if not llm_config_dict:
                    raise ValueError(
                        f"Could not find LLM config for model '{model_name}' (mapped to '{mapped_model}'). "
                        f"Available configs: {self.available_config_names}"
                    )

                llm_config_dict = _deep_convert_to_python(llm_config_dict)
                llm_config_omega = OmegaConf.create(llm_config_dict)
                agent = BasicDebateAgent(
                    config=AgentConfig(
                        prompt_config=PromptConfig(
                            system_prompt=prompts.get("system_prompt"),
                            partials=prompts.get("partials", {}),
                        ),
                        llm_config=LLMConfig.from_hydra_config(llm_config_omega),
                        name=agent_name,
                    ),
                    num_agents=len(agent_models),
                    domain=task,
                    debug=False,
                )

                actual_model_name = "unknown"
                try:
                    actual_model_name = agent.config.llm_config.language_models[0].model_name if agent.config.llm_config.language_models else mapped_model
                except Exception:
                    actual_model_name = mapped_model

                self.agent_metadata[agent.name] = {
                    "model_name": actual_model_name,
                    "is_human": False,
                    "original_model": model_name,
                    "mapped_model": mapped_model,
                }
            self.agent_name_map[agent.name] = agent
            agents.append(agent)

        await asyncio.gather(*(agent.build() for agent in agents))
        await asyncio.gather(*(agent.reset() for agent in agents))

        return agents

    def is_human_agent(self, agent_name: str) -> bool:
        return agent_name in self.human_agent_names

    def _extract_llm_configs_from_hydra(self, hydra_cfg: Dict[str, Any], agent_models: List[str]) -> Dict[str, Any]:
        llm_configs = {}
        model_counts = {}

        for model in agent_models:
            if model.lower() not in ['human-participant', 'human', 'mock/human']:
                model_counts[model] = model_counts.get(model, 0) + 1

        for idx, (model, count) in enumerate(model_counts.items(), 1):
            if idx <= 3:
                llm_configs[f"llm{idx}"] = {
                    "model": model,
                    "count": count
                }
        return llm_configs

    async def _generate_agent_response(
        self, agent: BasicDebateAgent, round_number: int, timeout: int = 300
    ) -> str:
        if self.is_human_agent(agent.name):
            current_q = self.questions[self.current_question_index] if self.current_question_index < len(self.questions) else {}
            other_answers = {
                a.name: a.answer_history[-1]
                for a in self.agents
                if a is not agent and hasattr(a, "answer_history") and a.answer_history
            }
            await self._emit_progress("waiting_for_human", {
                "agent_name": agent.name,
                "round_number": round_number,
                "question_index": self.current_question_index,
                "question_text": current_q.get("question", ""),
                "other_responses": other_answers,
            })
            response_text, extracted_answer = await self._wait_for_human_response(timeout)
            if hasattr(agent, "answer_history"):
                agent.answer_history.append(response_text)
            return response_text
        else:
            return await agent.generate_answer()

    async def _extract_agent_answer(self, agent: BasicDebateAgent, response_text: str) -> str:
        if self.is_human_agent(agent.name):
            return response_text
        else:
            return await agent.extract_answer_from_response(response_text)

    async def _emit_progress(self, event_type: str, data: Dict[str, Any]):
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
        logger.info(f"=== STARTING ROUND {round_number} ===")
        current_round = DebateRound(round_number=round_number)

        if round_number > 0:
            async def add_discussion_with_semaphore(agent):
                async with self.semaphore:
                    other_answers = []
                    for a in self.agents:
                        if a != agent and hasattr(a, 'answer_history') and a.answer_history:
                            other_answers.append(a.answer_history[-1])

                    if not other_answers:
                        return

                    return await agent.add_discussion_with_other_agents_in_context(
                        other_answers,
                        summarize=self.summarize,
                        additional_context=question_prompt if self.task in ["math", "gsm8k"] else None,
                    )

            discussion_tasks = [
                add_discussion_with_semaphore(agent)
                for i, agent in enumerate(self.agents)
                if skip_agent_index is None or i != skip_agent_index
            ]
            await asyncio.gather(*discussion_tasks, return_exceptions=True)

        async def generate_answer_with_semaphore(agent):
            async with self.semaphore:
                return await self._generate_agent_response(agent, round_number)

        participating_agents = [
            agent for i, agent in enumerate(self.agents)
            if skip_agent_index is None or i != skip_agent_index
        ]
        answer_tasks = [generate_answer_with_semaphore(agent) for agent in participating_agents]
        results = await asyncio.gather(*answer_tasks, return_exceptions=True)

        failed_agents = []
        for agent, result in zip(participating_agents, results):
            if isinstance(result, Exception):
                logger.error(f"Agent {agent.name} failed to generate answer in round {round_number}: {result}")
                failed_agents.append(agent.name)
                if hasattr(agent, 'answer_history'):
                    agent.answer_history.append(f"[ERROR: {type(result).__name__}: {result}]")

        if failed_agents:
            await self._emit_progress("agent_errors", {
                "round_number": round_number,
                "failed_agents": failed_agents,
            })

        for i, agent in enumerate(self.agents):
            if skip_agent_index is None or i != skip_agent_index:
                response = agent.latest_response()
                current_round.add_response(agent.name, response)

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
        logger.info(f"=== REPLAYING ROUND {round_number} ===")
        current_round = DebateRound(round_number=round_number)

        if previous_response and round_number > 0:
            for agent in self.agents:
                agent_name = agent.name
                if agent_name in previous_response:
                    prev_resp = previous_response[agent_name].get("response", "")
                    if prev_resp and hasattr(agent, 'answer_history'):
                        agent.answer_history.append(prev_resp)
                else:
                    for prev_agent_name, prev_data in previous_response.items():
                        if prev_agent_name in agent_name or agent_name in prev_agent_name:
                            prev_resp = prev_data.get("response", "")
                            if prev_resp and hasattr(agent, 'answer_history'):
                                agent.answer_history.append(prev_resp)
                                break

        if round_number > 0:
            async def add_discussion_with_semaphore(agent):
                async with self.semaphore:
                    other_answers = []
                    for a in self.agents:
                        if a != agent and hasattr(a, 'answer_history') and a.answer_history:
                            other_answers.append(a.answer_history[-1])

                    if not other_answers:
                        return

                    return await agent.add_discussion_with_other_agents_in_context(
                        other_answers,
                        summarize=self.summarize,
                        additional_context=question_prompt if self.task in ["math", "gsm8k"] else None,
                    )

            discussion_tasks = [add_discussion_with_semaphore(agent) for agent in self.agents]
            await asyncio.gather(*discussion_tasks, return_exceptions=True)

        async def generate_answer_with_semaphore(agent):
            async with self.semaphore:
                return await self._generate_agent_response(agent, round_number)

        answer_tasks = [generate_answer_with_semaphore(agent) for agent in self.agents]
        results = await asyncio.gather(*answer_tasks, return_exceptions=True)

        failed_agents = []
        for agent, result in zip(self.agents, results):
            if isinstance(result, Exception):
                logger.error(f"Agent {agent.name} failed to generate answer in replay round {round_number}: {result}")
                failed_agents.append(agent.name)
                if hasattr(agent, 'answer_history'):
                    agent.answer_history.append(f"[ERROR: {type(result).__name__}: {result}]")

        if failed_agents:
            await self._emit_progress("agent_errors", {
                "round_number": round_number,
                "failed_agents": failed_agents,
            })

        for agent in self.agents:
            response = agent.latest_response()
            current_round.add_response(agent.name, response)

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
        extracted_correct_answer = await self.extract_answer_from_response(correct_answer)

        extraction_tasks = []
        for agent_idx, agent in enumerate(self.agents):
            async def extract_and_package(a_idx, ag, r_data):
                if ag.name in r_data.responses:
                    resp = r_data.responses[ag.name]
                    if a_idx == human_agent_index and human_extracted_answer:
                        ext = await self.extract_answer_from_response(human_extracted_answer)
                    else:
                        ext = await self._extract_agent_answer(ag, resp)
                    return (ag.name, resp, ext)
                return (ag.name, None, None)
            extraction_tasks.append(extract_and_package(agent_idx, agent, round_data))

        results = await asyncio.gather(*extraction_tasks)
        extracted_map = {name: (resp, ext) for name, resp, ext in results}
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            if not self.current_question_session_id:
                if getattr(self, "custom_question_session_id", None):
                    self.current_question_session_id = self.custom_question_session_id
                else:
                    return
            agent_answers = []
            for name, (resp, ext) in extracted_map.items():
                if ext:
                    norm = normalize_util(ext)
                    if norm:
                        agent_answers.append(norm)

            majority_vote = 0.0
            if agent_answers:
                answer_counts = Counter(agent_answers)
                most_common_answer, most_common_count = answer_counts.most_common(1)[0]
                if most_common_count > len(agent_answers) / 2:
                    is_majority_correct = answers_util(most_common_answer, extracted_correct_answer)
                    majority_vote = 1.0 if is_majority_correct else 0.0

            round_obj = await repo.create_round(
                question_session_id=self.current_question_session_id,
                round_number=round_data.round_number,
                majority_vote=majority_vote
            )

            for agent_idx, agent in enumerate(self.agents):
                if agent.name in extracted_map:
                    response_text, extracted_answer = extracted_map[agent.name]
                    if response_text is not None:
                        is_correct = answers_util(extracted_answer, extracted_correct_answer) if extracted_answer else None
                        is_human = (agent_idx == human_agent_index)

                        model_name = None
                        if '_agent_' in agent.name:
                            model_name = agent.name.rsplit('_agent_', 1)[0]

                        if not model_name or model_name.startswith('human'):
                            if is_human or agent.name.startswith('human_agent'):
                                model_name = "human"

                        if self.config and 'agent_models' in self.config:
                            agent_models = self.config['agent_models']
                            if agent_idx < len(agent_models):
                                config_model = agent_models[agent_idx]
                                if not model_name or model_name == "unknown":
                                    if config_model.lower() in ['human-participant', 'human', 'mock/human']:
                                        model_name = "human"
                                    else:
                                        model_name = config_model

                        if not model_name or model_name == "unknown":
                            try:
                                if agent.config.llm_config and agent.config.llm_config.language_models:
                                    model_name = agent.config.llm_config.language_models[0].model_name
                            except Exception:
                                model_name = "unknown"

                        await repo.create_agent_response(
                            round_id=round_obj.id,
                            agent_index=agent_idx,
                            response_text=response_text,
                            extracted_answer=extracted_answer,
                            is_correct=is_correct,
                            model_name=model_name,
                            is_human=is_human
                        )

    async def _create_question_session(
        self,
        question: str,
        answer: str,
        question_prompt: Optional[str]
    ):
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)

            unique_str = f"{self.debate_id}_{self.current_question_index}_{question}_{answer}"
            hash_value = int(hashlib.sha256(unique_str.encode()).hexdigest()[:8], 16)
            question_id = hash_value % 2147483647

            question_obj = await repo.get_or_create_question(
                question_id=question_id,
                question_text=question,
                correct_answer=str(answer),
                question_prompt=question_prompt
            )

            await session.commit()
            await session.refresh(question_obj)

            question_session = await repo.create_question_session(
                debate_id=self.debate_id,
                question_id=question_obj.id,
                total_rounds=self.num_rounds
            )

            await session.commit()
            await session.refresh(question_session)

            self.current_question_session_id = question_session.id
            return question_session

    async def _create_question_session_with_record(
        self,
        question_record,
        answer: str
    ):
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
        return question_session

    async def _complete_question_session(self):
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
        async with self.db_manager.get_session() as session:
            repo = DebateRepository(session)
            await self._calculate_and_store_performance(repo)

    async def _calculate_and_store_performance(self, repo: DebateRepository):
        debate = await repo.get_debate_with_sessions(self.debate_id)
        if not debate:
            return

        round_performances = {}
        round_distribution = {}

        all_round_numbers = sorted({
            r.round_number
            for qs in debate.question_sessions
            for r in qs.rounds
        })
        round_number_to_display = {rn: i + 1 for i, rn in enumerate(all_round_numbers)}
        for question_session in debate.question_sessions:
            for round_obj in question_session.rounds:
                round_num = round_obj.round_number
                display_round_num = round_number_to_display[round_num]
                round_distribution[round_num] = round_distribution.get(round_num, 0) + 1
                if round_num < 0:
                    continue
                if display_round_num not in round_performances:
                    round_performances[display_round_num] = {}

                round_perf = round_performances[display_round_num]
                round_perf.setdefault("majority_vote", []).append(round_obj.majority_vote)

                round_model_counts = {}
                sorted_responses = sorted(round_obj.agent_response_records, key=lambda r: r.agent_index)

                for response in sorted_responses:
                    model_name = response.model_name
                    if model_name not in round_model_counts:
                        round_model_counts[model_name] = 0

                    local_index = round_model_counts[model_name]
                    round_model_counts[model_name] += 1

                    if response.is_human:
                        agent_key = f"human_agent_{local_index}"
                    else:
                        agent_key = f"{model_name}_agent_{local_index}"

                    round_perf.setdefault(agent_key, [])
                    if response.is_correct is not None:
                        round_perf[agent_key].append(1 if response.is_correct else 0)

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
        await repo.update_debate_performance_data(self.debate_id, performance_data)
        await repo.complete_debate(self.debate_id)
        await self._emit_progress("debate_completed", {
            "debate_id": str(self.debate_id),
            "total_questions": len(self.questions),
            "performance_data": performance_data
        })

    async def extract_answer_from_response(self, response: str) -> str:
        if not response:
            return ""

        final_answer_match = RE_FINAL_ANSWER_HASH.search(response)
        if final_answer_match:
            return final_answer_match.group(1).strip()

        if match := RE_FINAL_ANSWER_PAREN_X_1.search(response):
            return match.group(1).strip().upper()
        if match := RE_FINAL_ANSWER_PAREN_X_2.search(response):
            return match.group(1).strip().upper()
        if match := RE_FINAL_ANSWER_PAREN_X_3.search(response):
            return match.group(1).strip().upper()

        boxed_match = RE_BOXED.search(response)
        if boxed_match:
            return boxed_match.group(1).strip()

        RE_CLEAN_FINAL_PATTERNS = [
            re.compile(r'\(([A-E])\)\s*\.?\s*$', re.IGNORECASE),
            re.compile(r'\b([A-E])\)\s*\.?\s*$', re.IGNORECASE),
            re.compile(r'(?:the )?(?:final )?answer is[:\s]+\(?([A-E])\)?\s*\.?\s*$', re.IGNORECASE),
        ]
        for pattern in RE_CLEAN_FINAL_PATTERNS:
            if match := pattern.search(response):
                return match.group(1).strip().upper()

        # Only fall back to the free-text catch-alls if nothing clean was found
        for pattern in RE_TEXT_PATTERNS:
            match = pattern.search(response)
            if match:
                answer = match.group(1).strip()
                return answer.rstrip('.,;: ')

        sentences = [s.strip() for s in response.split('.') if s.strip()]
        if sentences:
            return sentences[-1][:100]

        return response[:100]

    def get_status(self) -> Dict[str, Any]:
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
            return response_text, extracted_answer
        except asyncio.TimeoutError:
            logger.error(f"Timeout waiting for human response after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Error waiting for human response: {e}", exc_info=True)
            raise

    @staticmethod
    def get_available_models() -> List[Dict[str, Any]]:
        configs = get_available_llm_configs()
        models = []

        for config_info in configs:
            config_name = config_info["config_name"]
            config_data = _deep_convert_to_python(config_info["config_data"])

            model_name = "unknown"
            litellm_model = ""
            provider = "unknown"

            if "language_models" in config_data:
                lang_models = config_data["language_models"]
                if lang_models and len(lang_models) > 0:
                    first_model = lang_models[0]
                    model_name = first_model.get("model_name", config_name)
                    if "litellm_params" in first_model:
                        litellm_model = first_model["litellm_params"].get("model", "")
                        if litellm_model.startswith("together_ai/"):
                            provider = "together_ai"
                        elif litellm_model.startswith("openai/"):
                            provider = "openai"
                        elif litellm_model.startswith("anthropic/"):
                            provider = "anthropic"
                        elif "gpt" in litellm_model.lower():
                            provider = "openai"

            models.append({
                "value": config_name,
                "label": model_name,
                "model": litellm_model,
                "provider": provider,
            })

        models.append({
            "value": "human-participant",
            "label": "Human Participant",
            "model": "human",
            "provider": "human",
        })

        return models