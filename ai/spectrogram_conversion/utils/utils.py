import os
import sys

import numpy as np

from ai.spectrogram_conversion.params import *


def get_conversion_root() -> str:
    if sys.platform == "darwin":
        return "/tmp/mvlive/conversion"
    else:
        return f"C:/Users/{os.getlogin()}/AppData/Local/Temp/mvlive/conversions"


def get_ordered_data_from_circular_buffer(
    buffer: np.ndarray, buffer_overflow: bool, head: int, segment_len: int = -1
) -> np.ndarray:
    out = None
    if segment_len == -1:
        # return the entire buffer in order
        out = np.concatenate((buffer[head:], buffer[:head]), axis=0) if buffer_overflow else buffer[:head]
        return out.flatten()

    if head + segment_len >= len(buffer):
        out = np.concatenate(
            (
                buffer[head:],
                buffer[0:(head + segment_len - len(buffer) + 1)]
            ),
            axis=0
        )
    else:
        out = buffer[head : head+segment_len]
    return out.flatten()
