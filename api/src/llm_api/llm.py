import os
import re
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from litellm import Router
from omegaconf import DictConfig, ListConfig, OmegaConf

logger = logging.getLogger(__name__)


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


def _resolve_env_var(value: Any) -> Any:
    if isinstance(value, str):
        env_pattern = re.compile(r'\$\{(?:oc\.env:)?([A-Z_][A-Z0-9_]*)(?:,([^}]*))?\}')
        def replace_env(match):
            env_var = match.group(1)
            default = match.group(2) if match.group(2) else None
            env_val = os.environ.get(env_var)
            if env_val:
                return env_val
            if default is not None:
                return default
            return f"os.environ/{env_var}"
        return env_pattern.sub(replace_env, value)
    elif isinstance(value, dict):
        return {k: _resolve_env_var(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_resolve_env_var(item) for item in value]
    return value


class LLM:
    def __init__(self, config):
        self.config = config
        self.router = self._build_router()
    
    def _build_router(self) -> Router:
        model_list = []
        
        language_models = getattr(self.config, 'language_models', None)
        if language_models is None and hasattr(self.config, '__getitem__'):
            language_models = self.config.get('language_models', [])
        
        if not language_models:
            raise ValueError("No language models configured")
        
        for lm in language_models:
            if hasattr(lm, 'litellm_params'):
                litellm_params = lm.litellm_params
            elif isinstance(lm, dict):
                litellm_params = lm.get('litellm_params', {})
            else:
                litellm_params = {}
            
            if hasattr(lm, 'model_name'):
                model_name = lm.model_name
            elif isinstance(lm, dict):
                model_name = lm.get('model_name', 'unknown')
            else:
                model_name = 'unknown'
            
            litellm_params = _deep_convert_to_python(litellm_params)
            litellm_params = _resolve_env_var(litellm_params)
            
            model_entry = {
                "model_name": model_name,
                "litellm_params": litellm_params
            }
            model_list.append(model_entry)
        
        completion_params = {}
        if hasattr(self.config, 'completion_params'):
            cp = self.config.completion_params
            if hasattr(cp, 'to_dict'):
                completion_params = cp.to_dict()
            elif isinstance(cp, dict):
                completion_params = cp
            else:
                completion_params = _deep_convert_to_python(cp)
        
        completion_params = _deep_convert_to_python(completion_params)
        
        router = Router(
            model_list=model_list,
            default_litellm_params=completion_params,
            num_retries=5,
            timeout=300,
            retry_after=5,
        )
        
        return router
    
    async def __call__(self, messages: List[Dict[str, str]], **kwargs) -> Any:
        language_models = getattr(self.config, 'language_models', None)
        if language_models is None and hasattr(self.config, '__getitem__'):
            language_models = self.config.get('language_models', [])
        
        if not language_models:
            raise ValueError("No language models configured")
        
        first_model = language_models[0]
        if hasattr(first_model, 'model_name'):
            model_name = first_model.model_name
        elif isinstance(first_model, dict):
            model_name = first_model.get('model_name', 'unknown')
        else:
            model_name = 'unknown'
        
        messages = _deep_convert_to_python(messages)
        kwargs = _deep_convert_to_python(kwargs)
        
        response = await self.router.acompletion(
            model=model_name,
            messages=messages,
            **kwargs
        )
        
        return response