from typing import Dict, List

import sounddevice as sd
from data_types import DeviceInfo


def get_devices(mode) -> Dict[str, List[DeviceInfo]]:
    sd._terminate()
    sd._initialize()

    inputs = []
    outputs = []
    excludeInputs = []
    excludeOutputs = []

    for index, dinfo in enumerate(sd.query_devices()):
        # If multiple portaudio interface APIs exist, chooses the first one
        # to prevent multiple devices being shown to the user (some of which may not work)
        # Refs:
        #  1. http://files.portaudio.com/docs/v19-doxydocs/api_overview.html
        #  2. https://stackoverflow.com/questions/20943803/pyaudio-duplicate-devices
        if dinfo["hostapi"] == 0:
            device_info = DeviceInfo(
                **{
                    "name": dinfo["name"],
                    "index": index,
                    "max_input_channels": dinfo["max_input_channels"],
                    "max_output_channels": dinfo["max_output_channels"],
                    "default_sample_rate": dinfo["default_samplerate"],
                    "is_default_input": index == sd.default.device[0],
                    "is_default_output": index == sd.default.device[1],
                }
            )

            if device_info.is_duplex:
                inputs.append(device_info)
                outputs.append(device_info)
            elif device_info.max_input_channels:
                inputs.append(device_info)
            elif device_info.max_output_channels:
                outputs.append(device_info)
            else:
                raise ValueError(f"Unknown device, {str(device_info)}")

    # There are three modes:
    # i) all - contains all devices
    # experimental & prod both remove 'system devices' like MetaVoice Cable Input & ZoomAudioDevice
    # ii) experimental - removes krisp speaker from output device, to enable krisp microphone as input
    # iii) prod - removes krisp microphones on top of experimental
    if mode != "all":
        excludeInputs.extend(["MetaVoice Cable", "ZoomAudioDevice"])
        excludeOutputs.extend(["ZoomAudioDevice"])

    if mode == "experimental":
        excludeOutputs.extend(["krisp speaker"])
    elif mode == "prod":
        excludeInputs.extend(["krisp microphone"])
        excludeOutputs.extend(["krisp speaker"])

    inputs = [d for d in inputs if d.name not in excludeInputs]
    outputs = [d for d in outputs if d.name not in excludeOutputs]

    return {
        "inputs": inputs,
        "outputs": outputs,
    }
