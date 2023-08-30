import logging
import time
from collections import deque
from functools import partial
from logging import Logger

import numpy as np


class PerfCounter:
    counter_index = {}
    q_ms_index = {}

    def __init__(
        self,
        name: str,
        logger: Logger,
        log_level: int = logging.INFO,
        window_len=10,
    ) -> None:
        if name not in PerfCounter.counter_index:
            PerfCounter.counter_index[name] = 0
        if name not in PerfCounter.q_ms_index:
            PerfCounter.q_ms_index[name] = deque(maxlen=window_len)

        self._name = name
        self._logger = logger
        self._log_level = log_level
        self._window_len = window_len
        self._start_sec = None

    def __enter__(self):
        self._start_sec = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        del exc_type, exc_val, exc_tb  # unused

        duration_ms = (time.time() - self._start_sec) * 1000
        PerfCounter.q_ms_index[self._name].append(duration_ms)

        counter = PerfCounter.counter_index[self._name]
        counter = (counter + 1) % self._window_len

        if counter >= self._window_len - 1:
            q = PerfCounter.q_ms_index[self._name]
            mean = np.mean(q)
            pct_95 = np.percentile(q, 95)
            max = np.max(q)

            spacing = " " * (20 - len(self._name))
            self._logger.log(
                self._log_level,
                f"{self._name}: {spacing}mean: {mean:0.2f}ms \tpct_95: {pct_95:0.2f}ms \tmax: {max:0.2f}ms",
            )

        PerfCounter.counter_index[self._name] = counter


DebugPerfCounter = partial(PerfCounter, log_level=logging.DEBUG)


if __name__ == "__main__":
    from timedscope import get_logger

    LOGGER = get_logger(__name__)

    for i in range(20):
        with PerfCounter("foo", LOGGER):
            a = 1 + 1
            time.sleep(0.1)

        with PerfCounter("bar", LOGGER):
            a = 1 + 1
            time.sleep(0.05)
