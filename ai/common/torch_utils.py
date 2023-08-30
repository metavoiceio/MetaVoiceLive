import random

import numpy as np
import torch


def is_mps_available() -> bool:
    try:
        return torch.backends.mps.is_available()
    except:
        return False


def get_device() -> torch.device:
    device = torch.device('cpu')

    if torch.cuda.is_available():
      device = torch.device('cuda')

    return device


def set_seed(seed):
    np.random.seed(seed)
    random.seed(seed)
    torch.manual_seed(seed)
