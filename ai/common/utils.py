import numpy as np
    

def db_to_amp(x) -> np.float32:
    return np.power(10.0, x * 0.05).astype(np.float32)
