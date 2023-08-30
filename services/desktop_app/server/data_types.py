from dataclasses import dataclass
from typing import Dict, List

from pydantic import BaseModel


@dataclass(frozen=True)
class DeviceInfo:
    index: int
    name: str
    max_input_channels: int
    max_output_channels: int
    default_sample_rate: float
    is_default_input: bool
    is_default_output: bool

    @property
    def is_duplex(self) -> bool:
        return bool(self.max_input_channels and self.max_output_channels)


DeviceMap = Dict[str, List[DeviceInfo]]


class ConvertRequest(BaseModel):
    input_device_idx: int
    output_device_idx: int
    voice_id: str
