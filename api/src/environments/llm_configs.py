import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/llm-configs", tags=["llm-configs"])


def normalize_config_name(name: str) -> str:
    """Convert hyphens to underscores for consistent config naming."""
    return name.replace("-", "_")


def get_llm_conf_directory() -> Path:
    current_file = Path(__file__).resolve()
    src_dir = current_file.parent.parent
    
    possible_paths = [
        src_dir / "conf" / "llm_conf",
        Path.cwd() / "src" / "conf" / "llm_conf",
        Path.cwd() / "api" / "src" / "conf" / "llm_conf",
        Path("/app/src/conf/llm_conf"),
    ]
    
    for path in possible_paths:
        resolved = path.resolve()
        if resolved.exists() and resolved.is_dir():
            logger.info(f"Found llm_conf at: {resolved}")
            return resolved
    
    checked = [str(p.resolve()) for p in possible_paths]
    raise FileNotFoundError(f"Could not find conf/llm_conf. Checked: {checked}")


def parse_llm_config(file_path: Path) -> Optional[Dict[str, Any]]:
    try:
        with open(file_path, 'r') as f:
            config = yaml.safe_load(f)
        
        if not config:
            return None
        
        if "language_models" in config and len(config["language_models"]) > 1:
            logger.debug(f"Skipping {file_path.stem}: multiple models")
            return None
        
        config_name = normalize_config_name(file_path.stem)
            
        result = {
            "config_name": config_name,
            "file_path": str(file_path),
            "display_name": config_name.replace("_", " ").replace("vec ", "").title(),
            "models": [],
            "provider": "unknown",
        }
        
        if "language_models" in config:
            for lm in config["language_models"]:
                model_info = {
                    "model_name": lm.get("model_name", "unknown"),
                    "litellm_model": None,
                    "timeout": None,
                    "rpm": None,
                }
                
                if "litellm_params" in lm:
                    params = lm["litellm_params"]
                    model_info["litellm_model"] = params.get("model")
                    model_info["timeout"] = params.get("timeout")
                    model_info["rpm"] = params.get("rpm")
                    
                    model_str = params.get("model", "")
                    if "mock/human" in model_str:
                        result["provider"] = "human"
                    elif model_str.startswith("together_ai/"):
                        result["provider"] = "together_ai"
                    elif model_str.startswith("openrouter/"):
                        result["provider"] = "openrouter"
                    elif model_str.startswith("openai/"):
                        result["provider"] = "openai"
                    elif model_str.startswith("anthropic/"):
                        result["provider"] = "anthropic"
                    elif "gpt" in model_str.lower():
                        result["provider"] = "openai"
                
                result["models"].append(model_info)
        
        if "completion_params" in config:
            result["completion_params"] = config["completion_params"]
        
        return result
        
    except Exception as e:
        logger.warning(f"Skipping {file_path.stem}: {e}")
        return None


@router.get("/")
async def list_available_llm_configs():
    try:
        llm_conf_dir = get_llm_conf_directory()
        configs = []
        seen_names = set()
        
        for file_path in sorted(llm_conf_dir.glob("*.yaml")):
            config = parse_llm_config(file_path)
            if config:
                normalized_name = config["config_name"]
                if normalized_name not in seen_names:
                    seen_names.add(normalized_name)
                    configs.append(config)
        
        for file_path in sorted(llm_conf_dir.glob("*.yml")):
            config = parse_llm_config(file_path)
            if config:
                normalized_name = config["config_name"]
                if normalized_name not in seen_names:
                    seen_names.add(normalized_name)
                    configs.append(config)
        
        return {"success": True, "configs": configs}
        
    except FileNotFoundError as e:
        logger.error(f"Directory not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing LLM configs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list LLM configs: {str(e)}")


@router.get("/simple")
async def list_llm_configs_simple():
    try:
        llm_conf_dir = get_llm_conf_directory()
        models = []
        seen_values = set()
        
        for file_path in sorted(llm_conf_dir.glob("*.yaml")):
            config = parse_llm_config(file_path)
            if config and config["models"]:
                value = config["config_name"]
                if value not in seen_values:
                    seen_values.add(value)
                    primary_model = config["models"][0]
                    models.append({
                        "value": value,
                        "label": primary_model.get("model_name", config["display_name"]),
                        "model": primary_model.get("litellm_model", ""),
                        "provider": config["provider"],
                    })
        
        for file_path in sorted(llm_conf_dir.glob("*.yml")):
            config = parse_llm_config(file_path)
            if config and config["models"]:
                value = config["config_name"]
                if value not in seen_values:
                    seen_values.add(value)
                    primary_model = config["models"][0]
                    models.append({
                        "value": value,
                        "label": primary_model.get("model_name", config["display_name"]),
                        "model": primary_model.get("litellm_model", ""),
                        "provider": config["provider"],
                    })
        
        return {"success": True, "models": models}
        
    except FileNotFoundError as e:
        logger.error(f"Directory not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing LLM configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{config_name}")
async def get_llm_config(config_name: str):
    try:
        llm_conf_dir = get_llm_conf_directory()
        normalized_name = normalize_config_name(config_name)
        
        for ext in [".yaml", ".yml"]:
            file_path = llm_conf_dir / f"{config_name}{ext}"
            if file_path.exists():
                config = parse_llm_config(file_path)
                if config:
                    return {"success": True, "config": config}
            
            file_path_normalized = llm_conf_dir / f"{normalized_name}{ext}"
            if file_path_normalized.exists():
                config = parse_llm_config(file_path_normalized)
                if config:
                    return {"success": True, "config": config}
            
            file_path_hyphen = llm_conf_dir / f"{config_name.replace('_', '-')}{ext}"
            if file_path_hyphen.exists():
                config = parse_llm_config(file_path_hyphen)
                if config:
                    return {"success": True, "config": config}
        
        raise HTTPException(status_code=404, detail=f"Config '{config_name}' not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting LLM config {config_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))