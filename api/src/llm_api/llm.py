import asyncio
import json
import logging
from typing import Callable, Literal, Optional, Union, List
from omegaconf import DictConfig, OmegaConf

import attrs
import litellm
from litellm import Router, APIError

from src.llm_api.base_llm_abstractions import LLMResponse, Message, LLMConfig

import os
os.environ["LITELLM_TELEMETRY"] = "False"
os.environ["LITELLM_LOGGING"] = "False"

# TODO: get logger from hydra
# from pr_agent.log import get_logger
# TMP only
litellm.telemetry = False
litellm.success_callback = []
litellm.failure_callback = []
litellm.callbacks = []
logger = logging.getLogger(__name__)


@attrs.define()
class LLMClient:
    config: LLMConfig  # the base LLM config given directly from the hydra config

    organization: Optional[str] = None
    print_prompt_and_response: bool = False

    router: Router = None
    model_name: str = None

    def __attrs_post_init__(self):
        litellm.organization = self.organization
        self._setup_api_keys()

        # for setting the callbacks
        # TODO: Set the callbacks here
        # https://docs.litellm.ai/docs/#track-costs-usage-latency-for-streaming
        # https://docs.litellm.ai/docs/observability/custom_callback

        # TODO: get the model list from the config
        # TODO: add a check that only a single model is supported for now
        # can add other model-specific parameters here as litellm params in the config
        # see: https://docs.litellm.ai/docs/routing
        # check that model_name is same for all the dicts in model_list
        model_names = [model.model_name for model in self.config.language_models]
        assert len(set(model_names)) == 1, "Only a single model is supported for now"
        self.model_name = model_names[0]
        # Convert to format expected by litellm Router
        model_list = [
            {
                "model_name": model.model_name,
                "litellm_params": model.litellm_params,
            }
            for model in self.config.language_models
        ]

        # print(json.dumps(OmegaConf.to_container(model_list), indent=2)) # TODO: remove it later, once logging is added
        self.router = Router(model_list=model_list)

        # Store completion params for later use
        # self.completion_params = self.config.completion_params

    def _setup_api_keys(self):
        """Set up API keys for different LLM providers."""
        # Load environment variables if .env exists
        if os.path.exists(".env"):
            from dotenv import load_dotenv

            load_dotenv()

        # Setup OpenAI API key
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            logger.error("OPENAI_API_KEY is not set")
            raise ValueError("OPENAI_API_KEY is not set in environment variables")
        litellm.openai_key = openai_key

        # TODO: do the same for other LLM providers
        # check if ANTHROPIC_API_KEY is set
        if os.getenv("ANTHROPIC_API_KEY") is not None:
            litellm.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        # NOERROR if not set

        # together api key
        if os.getenv("TOGETHERAI_API_KEY") is not None:
            litellm.togetherai_api_key = os.getenv("TOGETHERAI_API_KEY")

    # TODO: add the weave or logging decorator either here or in the agent? -> Going with the Agent for now
    async def __call__(
        self,
        messages: List[Message],
        **kwargs,
    ):
        try:
            resp, finish_reason = None, None

            # the base payload
            message_payload = [message.model_dump() for message in messages]
            logger.debug("Prompts", artifact=message_payload)

            # if self.config.verbosity_level >= 2:
            #     logger.info(f"\nSystem prompt:\n{message_payload}")

            # join the completion params in the config with the explicit kwargs
            completion_params = {
                **self.config.completion_params,  # Now using stored completion_params
                **kwargs,
            }

            response = await self.router.acompletion(
                model=self.model_name,
                messages=message_payload,
                **completion_params,
            )

        except Exception as e:
            logger.warning(f"Unknown error during LLM inference: {e}")
            # raise
            raise APIError from e

        if response is None or len(response["choices"]) == 0:
            # empty response
            raise APIError
        else:
            # extract the response
            # https://platform.openai.com/docs/quickstart?language-preference=python
            resp = response["choices"][0]["message"]["content"]
            finish_reason = response["choices"][0]["finish_reason"]

            prompt_tokens = (
                response["usage"]["prompt_tokens"] if response.usage else None
            )
            completion_tokens = (
                response["usage"]["completion_tokens"] if response.usage else None
            )
            total_tokens = response["usage"]["total_tokens"] if response.usage else None

            cost = (
                response._hidden_params["response_cost"]
                if response._hidden_params
                else None
            )
            logger.debug(f"\nAI response:\n{resp}")

            llm_response = LLMResponse(
                model=self.model_name,
                completion=resp,
                stop_reason=finish_reason,
                # token usage
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                # other fields
                cost=cost,
            )

            # TODO: add the other optional fields for the response

        return llm_response

    def add_litellm_callbacks(self, kwargs):
        pass
