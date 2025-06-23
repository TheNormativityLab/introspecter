import os
import json
import re
import yaml
from datetime import datetime, timezone
from pathlib import Path


def load_json_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"✗ Error loading {file_path}: {e}")
        return None


def load_yaml_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except ImportError:
        print("PyYAML not found. Please install it using: pip install PyYAML")
        return None
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None


def is_integer_folder(folder_name):
    try:
        int(folder_name)
        return True
    except ValueError:
        return False


def find_json_files(integer_folder_path):
    performance_file = None
    result_file = None
    
    for file in os.listdir(integer_folder_path):
        if file.endswith('_performance.json'):
            performance_file = os.path.join(integer_folder_path, file)
        elif file.endswith('_result.json'):
            result_file = os.path.join(integer_folder_path, file)
    
    return performance_file, result_file


def find_config_file(subfolder_path):
    config_path = os.path.join(subfolder_path, "config.yaml")
    if os.path.exists(config_path):
        return config_path
    return None


def find_wandb_metadata_file(subfolder_path):
    metadata_path = os.path.join(subfolder_path, "wandb-metadata.json")
    if os.path.exists(metadata_path):
        return metadata_path
    return None


def parse_llm_string_with_eval(llm_str):
    try:
        cleaned_str = re.sub(r'\$\{oc\.env:[^}]+\}', '""', llm_str)
        cleaned_str = re.sub(r'\$\{[^}]+\}', '""', cleaned_str)        
        result = eval(cleaned_str)
        return result
    except Exception as e:
        return None


def extract_model_config(model, llm_config):
    litellm_params = model.get('litellm_params', {})
    completion_params = llm_config.get('completion_params', {})
    
    model_config = {
        "model_name": model.get('model_name', ''),
        "model": litellm_params.get('model', ''),
        "api_base": litellm_params.get('api_base', ''),
        "timeout": litellm_params.get('timeout', 300),
        "num_retries": litellm_params.get('num_retries', 5),
        "rpm": litellm_params.get('rpm', None),
        "top_p": completion_params.get('top_p', None),
        "max_tokens": completion_params.get('max_tokens', None),
        "temperature": completion_params.get('temperature', None)
    }
    
    model_config = {k: v for k, v in model_config.items() if v is not None}
    return model_config


def parse_llm_configs(config_data):
    llm_configs = []
    llm_keys = ['llm1', 'llm2', 'llm3']
    
    for llm_key in llm_keys:
        if llm_key in config_data:
            llm_data = config_data[llm_key]
            
            if isinstance(llm_data, dict) and 'value' in llm_data:
                llm_str = llm_data['value']
            else:
                continue
            
            try:
                llm_config = parse_llm_string_with_eval(llm_str)
                
                if llm_config and isinstance(llm_config, dict) and 'language_models' in llm_config:
                    for model in llm_config['language_models']:
                        model_config = extract_model_config(model, llm_config)
                        llm_configs.append(model_config)
                
            except Exception as e:
                print(f"⚠ Error parsing {llm_key} config: {e}")
    
    return llm_configs


def get_llm_config_key(llm_config):
    return f"{llm_config.get('model_name', '')}|{llm_config.get('model', '')}"


def remove_duplicate_llm_configs(llm_configs):
    seen_configs = set()
    unique_configs = []
    
    for config in llm_configs:
        config_key = get_llm_config_key(config)
        if config_key not in seen_configs:
            seen_configs.add(config_key)
            unique_configs.append(config)
    
    return unique_configs


def process_wandb_metadata(metadata_data):
    if not metadata_data:
        return {}
    
    processed_metadata = {
        "startedAt": metadata_data.get("startedAt", ""),
    }
    
    args_dict = {}
    if "args" in metadata_data and isinstance(metadata_data["args"], list):
        for arg in metadata_data["args"]:
            if "=" in arg:
                key, value = arg.split("=", 1)
                try:
                    if "." in value:
                        value = float(value)
                    else:
                        value = int(value)
                except ValueError:
                    if value.lower() in ["true", "false"]:
                        value = value.lower() == "true"
                args_dict[key] = value
    
    processed_metadata["parsed_args"] = args_dict
    
    return processed_metadata


def process_wandb_data(wandb_data_path):
    results = []
    
    if not os.path.exists(wandb_data_path):
        print(f"Path {wandb_data_path} does not exist")
        return results
    
    total_processed = 0
    
    for subfolder in os.listdir(wandb_data_path):
        subfolder_path = os.path.join(wandb_data_path, subfolder)
        
        if not os.path.isdir(subfolder_path):
            continue
                
        config_file = find_config_file(subfolder_path)
        config_data = None
        llm_configs = []
        
        if config_file:
            config_data = load_yaml_file(config_file)
            if config_data:
                llm_configs = parse_llm_configs(config_data)
                llm_configs = remove_duplicate_llm_configs(llm_configs)
        
        metadata_file = find_wandb_metadata_file(subfolder_path)
        metadata_data = None
        processed_metadata = {}
        
        if metadata_file:
            metadata_data = load_json_file(metadata_file)
            if metadata_data:
                processed_metadata = process_wandb_metadata(metadata_data)
        
        for item in os.listdir(subfolder_path):
            item_path = os.path.join(subfolder_path, item)
            
            if os.path.isdir(item_path) and is_integer_folder(item):
                performance_file, result_file = find_json_files(item_path)
                
                if not performance_file or not result_file:
                    continue
                
                performance_data = load_json_file(performance_file)
                result_data = load_json_file(result_file)
                
                if performance_data is None or result_data is None:
                    continue
                
                combined_data = {
                    "status": "completed",
                    "performance_data": performance_data,
                    "result_data": result_data,
                    "modelConfig": {
                        "LLM": llm_configs,
                        "Human": []
                    },
                    "wandb_metadata": processed_metadata,
                    "processed_at": datetime.now(timezone.utc)
                }
                
                results.append(combined_data)
                total_processed += 1
    
    print(f"Processing {total_processed} records...")
    return results


def get_statistics(processed_data):
    if not processed_data:
        return {}
    
    all_llm_configs = []
    for data in processed_data:
        all_llm_configs.extend(data['modelConfig']['LLM'])
    
    unique_llm_configs = remove_duplicate_llm_configs(all_llm_configs)
    metadata_count = sum(1 for data in processed_data if data.get('wandb_metadata'))
    
    return {
        "total_records": len(processed_data),
        "unique_llm_configs": len(unique_llm_configs),
        "records_with_metadata": metadata_count
    }