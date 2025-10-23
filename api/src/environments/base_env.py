import logging

import attrs
from pydantic import BaseModel
from abc import ABC, abstractmethod
from typing import Optional, Tuple


class EnvObservation(BaseModel):
    observation: str
    reward: Optional[float] = None


class EnvAction(BaseModel):
    action: str
    env_level_action: Optional[int] = None


class BaseEnv(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def reset(self):
        pass

    @abstractmethod
    def step(self, action: EnvAction):
        pass

    @abstractmethod
    def get_observation(self) -> EnvObservation:
        pass
