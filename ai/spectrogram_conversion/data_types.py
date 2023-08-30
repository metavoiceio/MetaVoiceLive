from enum import Enum


class InferencePipelineMode(Enum):
    offline_with_overlap = "offline_with_overlap"
    online_raw = "online_raw"
    online_with_past_future = "online_with_past_future"
    online_crossfade = "online_crossfade"

    def __str__(self):
        return self.value
