import logging
import os
import time
from functools import partial
from logging import Logger

# disable numba debug logging
numba_logger = logging.getLogger("numba")
numba_logger.setLevel(logging.WARNING)

DEBUG_PATTERNS = [patt for patt in os.environ.get("DEBUG", "").split(",") if patt]


def get_logger(module_name: str):
    FORMAT = "%(name)s: %(message)s"
    level = logging.INFO
    if any(module_name.startswith(patt) for patt in DEBUG_PATTERNS):
        level = logging.DEBUG

    logging.basicConfig(level=level, format=FORMAT)
    return logging.getLogger(module_name)


class TimedScope:
    def __init__(
        self,
        name: str,
        logger: Logger,
        log_level: int = logging.INFO,
        **kwargs,
    ):
        del kwargs  # unused
        self._name = name
        self._logger = logger
        self._log_level = log_level

    def __enter__(self):
        self._start_secs = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        del exc_tb, exc_type, exc_val  # unused
        duration_ms = (time.time() - self._start_secs) * 1000
        self._logger.log(self._log_level, f"{self._name}: {duration_ms:0.2f}ms")


DebugTimedScope = partial(TimedScope, log_level=logging.DEBUG)
