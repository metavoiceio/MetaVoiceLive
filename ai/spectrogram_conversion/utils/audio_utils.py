from typing import Tuple

import sounddevice as sd


def get_audio_io_indices() -> Tuple[int, int]:
    def check_device_exists(device_index: int):
        try:
            sd.query_devices(device_index)
        except sd.PortAudioError as e:
            print(str(e))

    print(sd.query_devices())
    input_index = int(input("Enter the input audio device index: "))
    check_device_exists(input_index)

    output_index = int(input("Enter the output audio device index: "))
    check_device_exists(output_index)

    return input_index, output_index
