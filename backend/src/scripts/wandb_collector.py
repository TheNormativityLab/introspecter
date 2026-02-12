import wandb
import json
import sys
import yaml
import os
import tempfile
import re
import time
from concurrent.futures import ThreadPoolExecutor

def process_single_run(run, existing_ids):
    if run.id in existing_ids:
        return None

    for attempt in range(3):
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                run_files = [f.name for f in run.files()]
                
                perf_name = next((f for f in run_files if re.search(r'\d/.*_performance\.json$', f)), None)
                res_name = next((f for f in run_files if re.search(r'\d/.*_result\.json$', f)), None)
                cfg_name = next((f for f in run_files if "config.yaml" in f), None)

                if not perf_name or not res_name:
                    return None

                run.file(perf_name).download(root=tmpdir, replace=True)
                run.file(res_name).download(root=tmpdir, replace=True)
                
                with open(os.path.join(tmpdir, perf_name), 'r') as f:
                    performance_data = json.load(f)
                with open(os.path.join(tmpdir, res_name), 'r') as f:
                    result_data = json.load(f)

                config_data = {}
                if cfg_name:
                    run.file(cfg_name).download(root=tmpdir, replace=True)
                    with open(os.path.join(tmpdir, cfg_name), 'r') as f:
                        config_data = yaml.safe_load(f)

                raw_dataset_name = None
                task_cfg = config_data.get("task", {})
                if isinstance(task_cfg, dict):
                    val = task_cfg.get("value", {})
                    if isinstance(val, dict):
                        raw_dataset_name = val.get("name")
                
                if not raw_dataset_name:
                    raw_dataset_name = os.path.basename(perf_name).replace('_performance.json', '')

                clean_dataset_name = re.sub(r'_pro\b', '', raw_dataset_name).strip()
                
                llms = []
                for i in range(1, 4):
                    key = f"llm{i}"
                    val = config_data.get(key, {}).get('value', {})
                    if val:
                        try:
                            if isinstance(val, str):
                                val = json.loads(val.replace("'", '"'))
                            m_name = val.get('language_models', [{}])[0].get('model_name', f'agent_{i-1}')
                            llms.append({"model_name": f"agent_{i-1}", "model": m_name})
                        except: pass

                seed_from_path = perf_name.split('/')[0]
                final_seed = config_data.get("seed", {}).get("value")
                if final_seed is None:
                    try: final_seed = int(seed_from_path)
                    except: final_seed = None

                return {
                    "experiment_id": run.id,
                    "status": "completed",
                    "performance_data": performance_data,
                    "result_data": result_data,
                    "modelConfig": {"LLM": llms},
                    "wandb_metadata": {
                        "tags": run.tags, 
                        "url": run.url, 
                        "run_name": run.name,
                        "parsed_args": config_data
                    },
                    "current_seed": final_seed,
                    "dataset_name": clean_dataset_name,
                    "processed_at": run.created_at
                }
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
                continue
            print(f"[ERROR] Run {run.id} failed after retries {e}", file=sys.stderr)
            return None
    
def collect():
    try:
        input_raw = sys.stdin.read().strip()
        if not input_raw:
            payload = {}
        else:
            payload = json.loads(input_raw)
            
        if isinstance(payload, list):
            existing_ids = set(payload)
            last_sync_time = None
        else:
            existing_ids = set(payload.get("existingIds", []))
            last_sync_time = payload.get("lastSyncTime")
    except Exception as e:
        print(f"[ERROR] Input parsing failed: {e}", file=sys.stderr)
        existing_ids = set()
        last_sync_time = None

    api = wandb.Api(timeout=300)
    filters = {"state": "finished"}
    if last_sync_time:
        filters["created_at"] = {"$gt": last_sync_time}

    print(f"[DEBUG] Querying W&B with filters: {filters}", file=sys.stderr)

    try:
        runs_iterator = api.runs(
            "thenormativitylab/basic_debate", 
            filters=filters, 
            order="-created_at"
        )
        
        active_runs = []
        
        for run in runs_iterator:
            if run.id not in existing_ids:
                active_runs.append(run)

        print(f"[DEBUG] Processing {len(active_runs)} new runs", file=sys.stderr)
        
        results = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(process_single_run, run, existing_ids) for run in active_runs]
            for future in futures:
                res = future.result()
                if res:
                    results.append(res)

        fd, path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as tmp:
            json.dump(results, tmp)
        
        return path
    except Exception as fatal_error:
        print(f"[FATAL] Collection failed {fatal_error}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    file_path = collect()
    if file_path:
        print(file_path)