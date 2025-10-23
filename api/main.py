from omegaconf import DictConfig, OmegaConf
import json
import hydra

from src.llm_api.llm import LLMClient
from src.llm_api.base_llm_abstractions import Message
import asyncio
import logging


loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.DEBUG)

# Configure root logger to show debug logs
logging.basicConfig(level=logging.DEBUG)


def hello_message():
    messages = []
    messages.append(Message(role="system", content="You are not a helpful assistant."))
    messages.append(Message(role="user", content="Hello, how are you?"))
    return messages


async def test_llm_call(cfg: DictConfig):
    llm = LLMClient(config=cfg)
    messages = hello_message()
    # print(messages)

    response = await llm(messages=messages)
    print(response)

    print("--------  COST ------------------------")
    print(response.cost)
    formatted_string = f"${float(response.cost):.10f}"
    print(formatted_string)
    print("--------------------------------")

    assert response.completion is not None
    assert isinstance(response.completion, str)
    assert len(response.completion) > 0


@hydra.main(
    version_base=None,
    config_path="conf/llm_conf",
    config_name="vec_mistral_7B",
    # config_name="vec_llama_3_1_8B",
)
def my_app(cfg: DictConfig) -> None:
    # print("Config:")
    # print(json.dumps(OmegaConf.to_container(cfg), indent=2))
    # print(OmegaConf.to_yaml(cfg))
    print("--------------------------------")

    print("Testing LLM call...")
    # print(cfg.llm_conf)
    asyncio.run(test_llm_call(cfg))


if __name__ == "__main__":
    my_app()
