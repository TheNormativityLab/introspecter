# scripts/api_client.py - Updated with Human-in-Loop Support
import requests
import time
import sys
import json
from typing import Optional, Dict, Any

BASE_URL = "http://localhost:3001"
 
def test_health():
    """Test if API is running."""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        response.raise_for_status()
        health_data = response.json()
        print("✓ API is healthy")
        print(f"  Database: {health_data.get('database', 'unknown')}")
        print(f"  Celery Workers: {health_data.get('celery_workers', 0)}")
        print(f"  RabbitMQ: {health_data.get('rabbitmq', 'unknown')}")
        print(f"  Active WebSockets: {health_data.get('active_websockets', 0)}")
        return True
    except Exception as e:
        print(f"❌ API health check failed: {e}")
        return False

def create_debate(
    num_agents: int = 2,
    human_agent_index: Optional[int] = None,
    num_questions: int = 1,
    num_rounds: int = 2,
    task: str = "gsm8k"
) -> Optional[str]:
    """
    Create a debate with configurable parameters.
    
    Args:
        num_agents: Total number of agents
        human_agent_index: Index of human agent (None for all AI)
        num_questions: Number of questions to debate
        num_rounds: Number of rounds per question
        task: Task type (gsm8k, mmlu, math, commonsense_qa)
    """
    
    payload = {
        "debate_type": "basic_debate",
        "task": task,
        "num_questions": num_questions,
        "num_rounds": num_rounds,
        "num_agents": num_agents,
        "name": f"test_debate_{'human' if human_agent_index is not None else 'ai_only'}",
        "seed": 0,
        "summarize": True,
        "llm_conf@llm1": "gpt_4o_mini"
    }
    
    # Add human agent index if specified
    if human_agent_index is not None:
        payload["human_agent_index"] = human_agent_index
    
    print("\n" + "="*60)
    print(f"CREATING DEBATE ({'WITH HUMAN' if human_agent_index is not None else 'AI ONLY'})")
    print("="*60)
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/debates",
            json=payload,
            timeout=30
        )
        
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 201:
            result = response.json()
            print("\n✓ Debate created successfully!")
            print(f"  Debate ID: {result['debate_id']}")
            print(f"  Type: {result['debate_type']}")
            print(f"  Status: {result['status']}")
            print(f"  Task ID: {result['celery_task_id']}")
            print(f"  Questions: {result['total_questions']}")
            print(f"  WebSocket URL: {result['websocket_url']}")
            if result.get('human_agent_index') is not None:
                print(f"  Human Agent Index: {result['human_agent_index']}")
            return result['debate_id']
        else:
            print(f"\n❌ Failed to create debate: {response.status_code}")
            print(f"Response: {response.text}")
            try:
                error_detail = response.json()
                print(f"Error detail: {json.dumps(error_detail, indent=2)}")
            except:
                pass
            return None
            
    except requests.exceptions.Timeout:
        print("\n❌ Request timed out")
        return None
    except requests.exceptions.ConnectionError:
        print("\n❌ Connection error - is the API running?")
        return None
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

def monitor_debate(debate_id: str, check_websocket: bool = False) -> Optional[Dict[str, Any]]:
    """
    Monitor debate progress.
    
    Args:
        debate_id: UUID of the debate
        check_websocket: Whether to check WebSocket connection status
    """
    print("\n" + "="*60)
    print("MONITORING DEBATE")
    print("="*60)
    
    previous_status = None
    max_iterations = 120
    iteration = 0
    poll_interval = 3
    
    while iteration < max_iterations:
        try:
            response = requests.get(
                f"{BASE_URL}/debates/{debate_id}/status",
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"❌ Status check failed: {response.status_code}")
                print(f"   {response.text}")
                break
            
            status = response.json()
            
            current_status = (
                status.get('status'),
                status.get('current_question_index'),
                status.get('current_round', 0)
            )
            
            # Only print if status changed
            if current_status != previous_status:
                elapsed_time = iteration * poll_interval
                ws_status = ""
                if check_websocket and status.get('websocket_connected') is not None:
                    ws_status = f" | WS: {'✓' if status['websocket_connected'] else '✗'}"
                
                print(
                    f"[{elapsed_time:4d}s] Status: {status.get('status', 'unknown'):12} | "
                    f"Question: {status.get('current_question_index', 0)}/{status.get('total_questions', 0)}"
                    f"{ws_status}"
                )
                
                # Show task status if available
                if status.get('task_status'):
                    task_status = status['task_status']
                    print(f"         Task: {task_status.get('state', 'unknown')}")
                
                previous_status = current_status
            
            # Check if completed or failed
            if status.get('status') in ['completed', 'failed', 'cancelled', 'timeout']:
                emoji = '✓' if status.get('status') == 'completed' else '❌'
                print(f"\n{emoji} Debate {status.get('status')}!")
                return status
            
        except requests.exceptions.RequestException as e:
            print(f"⚠ Error checking status: {e}")
        
        time.sleep(poll_interval)
        iteration += 1
    
    print("\n⚠ Monitoring stopped after max iterations")
    return None
    
def get_results(debate_id: str) -> Optional[Dict[str, Any]]:
    """Get debate results."""
    print("\n" + "="*60)
    print("FETCHING RESULTS")
    print("="*60)
    
    try:
        response = requests.get(
            f"{BASE_URL}/debates/{debate_id}/results",
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            print("\n✓ Results fetched successfully!")
            
            # Print summary
            print(f"\nDebate: {results.get('name')}")
            print(f"Type: {results.get('debate_type')}")
            print(f"Status: {results.get('status')}")
            print(f"Questions: {results.get('completed_questions')}/{results.get('total_questions')}")
            
            # Print question summaries
            for q_idx, question in enumerate(results.get('questions', [])):
                print(f"\n--- Question {q_idx + 1} ---")
                print(f"Q: {question.get('question_text', 'N/A')[:100]}...")
                print(f"Correct Answer: {question.get('correct_answer')}")
                
                for round_data in question.get('rounds', []):
                    print(f"\n  Round {round_data['round_number']}:")
                    print(f"  Majority Vote: {round_data.get('majority_vote', 0):.2f}")
                    
                    for resp in round_data.get('responses', []):
                        agent_type = "HUMAN" if resp.get('is_human') else "AI"
                        correct = "✓" if resp.get('is_correct') else "✗"
                        print(f"    [{agent_type}] Agent {resp['agent_index']}: {resp.get('extracted_answer')} {correct}")
            
            return results
        else:
            print(f"⚠ Could not fetch results: {response.status_code}")
            print(f"   {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching results: {e}")
        return None

def test_ai_only_debate():
    """Test 1: All AI agents debate."""
    print("\n" + "="*70)
    print(" TEST 1: ALL AI AGENTS ")
    print("="*70)
    
    debate_id = create_debate(
        num_agents=2,
        human_agent_index=None,
        num_questions=1,
        num_rounds=2,
        task="gsm8k"
    )
    
    if not debate_id:
        print("\n❌ Failed to create AI-only debate")
        return False
    
    # Monitor progress
    final_status = monitor_debate(debate_id, check_websocket=False)
    
    # Get results if completed
    if final_status and final_status.get('status') == 'completed':
        get_results(debate_id)
        print("\n✓ AI-only debate completed successfully!")
        return True
    else:
        print("\n❌ AI-only debate did not complete successfully")
        return False

def test_human_in_loop_debate():
    """Test 2: Debate with human participant."""
    print("\n" + "="*70)
    print(" TEST 2: WITH HUMAN AGENT ")
    print("="*70)
    print("\n⚠ IMPORTANT: This test requires a WebSocket client to provide human responses!")
    print("   The debate will wait for human input on each round.")
    print("   You can test this manually or implement a WebSocket client.\n")
    
    debate_id = create_debate(
        num_agents=2,
        human_agent_index=0,  # First agent is human
        num_questions=1,
        num_rounds=2,
        task="gsm8k"
    )
    
    if not debate_id:
        print("\n❌ Failed to create human-in-loop debate")
        return False
    
    print(f"\n📡 Connect to WebSocket: ws://localhost:8000/ws/debates/{debate_id}")
    print("   Send messages like: {'type': 'human_response', 'response_text': '...', 'extracted_answer': '42'}")
    
    # Monitor progress (will pause when waiting for human)
    final_status = monitor_debate(debate_id, check_websocket=True)
    
    # Get results if completed
    if final_status and final_status.get('status') == 'completed':
        get_results(debate_id)
        print("\n✓ Human-in-loop debate completed successfully!")
        return True
    else:
        print("\n❌ Human-in-loop debate did not complete")
        print("   (This is expected if no human responses were provided)")
        return False

def run_all_tests():
    """Run all tests in sequence."""
    print("="*70)
    print(" DEBATE API CLIENT - COMPREHENSIVE TEST SUITE ")
    print("="*70)
    
    # Check API health
    if not test_health():
        print("\n❌ API is not available. Please start the server first.")
        print("   Run: uvicorn api.main:app --reload")
        return False
    
    results = {
        "ai_only": False,
        "human_in_loop": False
    }
    
    # Test 1: AI only
    try:
        results["ai_only"] = test_ai_only_debate()
    except Exception as e:
        print(f"\n❌ Test 1 failed with exception: {e}")
        import traceback
        traceback.print_exc()
    
    # Wait between tests
    print("\n⏸ Waiting 5 seconds before next test...")
    time.sleep(5)
    
    # Test 2: Human in loop
    try:
        results["human_in_loop"] = test_human_in_loop_debate()
    except Exception as e:
        print(f"\n❌ Test 2 failed with exception: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "="*70)
    print(" TEST SUMMARY ")
    print("="*70)
    print(f"  AI-only debate:      {'✓ PASSED' if results['ai_only'] else '✗ FAILED'}")
    print(f"  Human-in-loop debate: {'✓ PASSED' if results['human_in_loop'] else '✗ FAILED'}")
    print("="*70)
    
    return all(results.values())

def main():
    """Main execution flow."""
    if len(sys.argv) > 1:
        test_name = sys.argv[1].lower()
        
        if test_name == "ai":
            success = test_ai_only_debate()
        elif test_name == "human":
            success = test_human_in_loop_debate()
        elif test_name == "all":
            success = run_all_tests()
        else:
            print(f"Unknown test: {test_name}")
            print("Usage: python api_client.py [ai|human|all]")
            sys.exit(1)
    else:
        # Default: run all tests
        success = run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠ Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)