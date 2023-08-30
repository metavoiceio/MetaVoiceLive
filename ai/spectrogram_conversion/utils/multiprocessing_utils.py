import multiprocessing


class SharedCounter(object):
    """A synchronized shared counter."""

    def __init__(self, initval=0):
        self.count = multiprocessing.Value("i", initval)

    def increment(self, n=1):
        """Increment the counter by n (default = 1)"""
        with self.count.get_lock():
            self.count.value += n

    @property
    def value(self):
        """Return the value of the counter"""
        return self.count.value
