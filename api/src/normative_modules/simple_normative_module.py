from src.llm_api.llm import LLMClient
from src.llm_api import Message
from src.normative_modules.base_normative_module import NormativeModule
import attrs

@attrs.define
class SimpleNormativeModule(NormativeModule):
    """
    A normative module that simply predicts the normative criteria by feeding all previous messages and discussion into a language model. 
    This normative module does not distinguish between different responses from other agents, e.g. whether they are providing reasoning + 
    an example usage of the normative criteria, or feedback/criticism of the newcomer agent for not using the norm. 
    """
    llm: LLMClient = attrs.field(init=False)
    norm_history: list = attrs.field(init=False, default=[])

    def __init__(self, llm_config):
        super().__init__()
        self.llm = LLMClient(config=llm_config)
        # set to valid string to prevent errors
        self.normative_criteria_description = "No criteria specified. " 
        self.norm_history = []
        # TODO figure out how to set up an associated config file; for now just specify the single LLM config
        # maybe also specify the system prompt here?

    def get_history(self):
        """
        Retrieve the history of all states of the normative module. 
        """
        return self.norm_history

    async def identify_normative_criteria(self, msg_history):
        """
        Identify the normative criteria by simply feeding the entire debate history to the LLM and asking it to identify the normative criteria.
        """
        sys_prompt = """
        You are tasked with identifying a particular conversational normative criteria given traces of a conversation between multiple agents.
        There are some agents who know and follow the criteria, and who will give unhelpful responses if the criteria are not followed.
        In one to two sentences, summarize the normative criteria that the agents are expected to follow in this conversation.
        """
        messages = [Message(role="system", content=sys_prompt)] + msg_history
        messages = messages + [Message(role="system", content="Provide a summary of the normative criteria in one to two sentences.")]
        self.normative_criteria_description = await self.llm(messages)
        self.normative_criteria_description = self.normative_criteria_description.completion
        self.norm_history.append(self.normative_criteria_description)

    async def apply_normative_criteria(self, message):
        """
        Set the normative criteria function after initialization.
        """
        sys_prompt = "Edit the following message such that it satisfies the following normative criteria: " + self.normative_criteria_description
        messages = [Message(role="system", content=sys_prompt), Message(role="user", content=message)]
        response = await self.llm(messages)
        return response.completion
        

    async def check_normative_criteria(self, message):
        """
        Check if the message satisfies the normative criteria.
        This can be used to check the messages from other agents and engage in "shunning" behavior as needed. 
        TODO shunning behavior needs to be implemented
        TODO need to have a more robust way of checking criteria
        """
        sys_prompt = "Check if the given message satisfies the following normative criteria: " + self.normative_criteria_description
        sys_prompt += "Respond with 'yes' if the message satisfies the criteria, and 'no' if it does not. Do not provide any other reasoning. "
        messages = [Message(role="system", content=sys_prompt), Message(role="user", content=message)]
        response = await self.llm(messages)
        return 'yes' in response.completion.lower()