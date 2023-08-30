"""
python inference_rt.py --trg_id 1 --mode online_crossfade
DEBUG=inference_rt python inference_rt.py --trg_id 1 --mode online_crossfade
"""
import argparse
import math
import multiprocessing
import os
import time
from collections import deque
from multiprocessing import Process, Queue, Value
from queue import Empty
from typing import Callable, Optional

import numpy as np
import pyaudio

from ai.common.torch_utils import get_device, set_seed
from ai.spectrogram_conversion.data_types import InferencePipelineMode
from ai.spectrogram_conversion.params import (MAX_INFER_SAMPLES_VC, SEED,
                                              sample_rate)
from ai.spectrogram_conversion.perf_counter import DebugPerfCounter
from ai.spectrogram_conversion.timedscope import TimedScope, get_logger
from ai.spectrogram_conversion.utils.audio_utils import get_audio_io_indices
from ai.spectrogram_conversion.utils.multiprocessing_utils import SharedCounter
from ai.spectrogram_conversion.utils.utils import (
    get_conversion_root, get_ordered_data_from_circular_buffer)
from ai.spectrogram_conversion.voice_conversion import ModelConversionPipeline

_LOGGER = get_logger(os.path.basename(__file__))
set_seed(SEED)

# ----------------
#  PyAudio Setup
# ----------------

p = pyaudio.PyAudio()
FORMAT = pyaudio.paFloat32
CHANNELS = 1
RATE = sample_rate

# serves as the head pointer for the audio_in & audio_out circular buffers
PACKET_ID = 0
BUFFER_OVERFLOW = False
PACKET_START_S = None
WAV: Optional[np.ndarray] = None


# TODO sidroopdaska: remove numpy.ndarray allocation
# TODO sidroopdaska: create a lock-free, single producer and single consumer ring buffer
def get_io_stream_callback(
    q_in: Queue,
    q_in_counter: Value,
    data: list,
    audio_in: list,
    q_out: Queue,
    q_out_counter: Value,
    audio_out: list,
    MAX_RECORD_SEGMENTS: int,
    latency_queue: Optional[multiprocessing.Queue] = None,
    frame_dropping: Optional[multiprocessing.Queue] = None,
) -> Callable:
    def callback(in_data, frame_count, time_info, status):
        global PACKET_ID, PACKET_START_S, WAV, BUFFER_OVERFLOW

        _LOGGER.debug(f"io_stream_callback duration={time.time() - PACKET_START_S}")
        _LOGGER.debug(f"io_stream_callback frame_count={frame_count}")
        if status:
            _LOGGER.warn(f"status: {status}")

        in_data_np = np.frombuffer(in_data, dtype=np.float32)

        audio_in[PACKET_ID] = in_data_np
        data.append(in_data_np)
        q_in.put_nowait(
            (
                PACKET_ID,
                PACKET_START_S,
                # passing data as bytes in multiprocessing:Queue is quicker
                np.array(data).flatten().astype(np.float32)[-MAX_INFER_SAMPLES_VC:].tobytes(),
            )
        )
        q_in_counter.increment()

        # prepare output
        out_data = None
        p_id, p_start_s = None, None
        latency_dump = None

        if q_out_counter.value == 0:
            _LOGGER.info("q_out: underflow")
            out_data = np.zeros(frame_count).astype(np.float32).tobytes()

            if frame_dropping:
                frame_dropping.put_nowait(-1)
            if latency_queue:
                latency_dump = 1000
        elif q_out_counter.value == 1:
            p_id, p_start_s, out_data = q_out.get_nowait()
            q_out_counter.increment(-1)

            if frame_dropping:
                frame_dropping.put_nowait(0)
            if latency_queue:
                latency_dump = time.time() - p_start_s
        else:
            _LOGGER.info("q_out: overflow")

            if frame_dropping:
                frame_dropping.put_nowait(1)
            if latency_queue:
                latency_dump = 0

            while not q_out.empty():
                try:
                    p_id, p_start_s, out_data = q_out.get_nowait()
                    q_out_counter.increment(-1)
                except Empty:
                    pass

        if latency_queue:
            latency_queue.put_nowait(latency_dump)

        if p_id and p_id % 3 == 0:
            _LOGGER.info(f"roundtrip: {time.time() - p_start_s}")

        audio_out[PACKET_ID] = np.frombuffer(out_data, dtype=np.float32)

        # update vars
        if (PACKET_ID + 1) >= MAX_RECORD_SEGMENTS:
            PACKET_ID = 0
            BUFFER_OVERFLOW = True
        else:
            PACKET_ID += 1

        PACKET_START_S = time.time()
        return (out_data, pyaudio.paContinue)

    return callback


# --------------------
#  Conversion pipeline
# --------------------
class ConversionPipeline(ModelConversionPipeline):
    def __init__(self, opt: argparse.Namespace):
        super().__init__(opt)

        fade_duration_ms = 20
        self._fade_samples = int(fade_duration_ms / 1000 * sample_rate)  # 20ms

        self._linear_fade_in = np.linspace(0, 1, self._fade_samples, dtype=np.float32)
        self._linear_fade_out = np.linspace(1, 0, self._fade_samples, dtype=np.float32)
        self._old_samples = np.zeros(self._fade_samples, dtype=np.float32)

    def run(self, wav: np.ndarray, HDW_FRAMES_PER_BUFFER: int):
        if self._opt.mode == InferencePipelineMode.online_crossfade:
            return self.run_cross_fade(wav, HDW_FRAMES_PER_BUFFER)
        elif self._opt.mode == InferencePipelineMode.online_with_past_future:
            raise NotImplementedError
        else:
            raise Exception(f"Mode: {self._opt.mode} unsupported")

    # Linear cross-fade
    def run_cross_fade(self, wav: np.ndarray, HDW_FRAMES_PER_BUFFER: int):
        with DebugPerfCounter("voice_conversion", _LOGGER):
            with DebugPerfCounter("model", _LOGGER):
                out = self.infer(wav)

                # suppress output if excessive model amplification detected
                threshold = None
                if type(self._opt.noise_suppression_threshold) == float:
                    threshold = self._opt.noise_suppression_threshold
                else:
                    with self._opt.noise_suppression_threshold.get_lock():
                        threshold = self._opt.noise_suppression_threshold.value

                _LOGGER.debug(f"noise_suppression_threshold: {threshold}")
                if np.max(np.abs(out)) > (threshold * np.max(np.abs(wav))):
                    _LOGGER.debug("supressing noise")
                    out = 0 * out

                # cross-fade = fade_in + fade_out
                out[-(HDW_FRAMES_PER_BUFFER + self._fade_samples) : -HDW_FRAMES_PER_BUFFER] = (
                    out[-(HDW_FRAMES_PER_BUFFER + self._fade_samples) : -HDW_FRAMES_PER_BUFFER] * self._linear_fade_in
                ) + (self._old_samples * self._linear_fade_out)
                # save
                self._old_samples = out[-self._fade_samples :]
                # send
                out = out[-(HDW_FRAMES_PER_BUFFER + self._fade_samples) : -self._fade_samples]
        return out


# -------------------
#  Main app processes
# -------------------
def conversion_process_target(
    stop: Value,
    q_in: Queue,
    q_out: Queue,
    q_in_counter: SharedCounter,
    q_out_counter: SharedCounter,
    model_warmup_complete: Value,
    opt: dict,
    HDW_FRAMES_PER_BUFFER: int,
):
    voice_conversion = ConversionPipeline(opt)

    # warmup models into the cache
    warmup_iterations = 10
    for _ in range(warmup_iterations):
        wav = np.random.rand(MAX_INFER_SAMPLES_VC).astype(np.float32)
        voice_conversion.run(wav, HDW_FRAMES_PER_BUFFER)
    model_warmup_complete.value = 1

    try:
        while not stop.value:
            p_id, p_start_s, wav_bytes = q_in.get()
            q_in_counter.increment(-1)

            wav = np.frombuffer(wav_bytes, dtype=np.float32)
            out = voice_conversion.run(wav, HDW_FRAMES_PER_BUFFER)

            q_out.put_nowait((p_id, p_start_s, out.tobytes()))
            q_out_counter.increment()
    except KeyboardInterrupt:
        pass
    finally:
        _LOGGER.info("conversion_process_target: stopped")


def run_inference_rt(
    opt: argparse.Namespace,
    stop_pipeline: Value,
    has_pipeline_started: Optional[Value] = None,
    latency_queue: Optional[multiprocessing.Queue] = None,
    frame_dropping: Optional[multiprocessing.Queue] = None,
):
    """
    NOTE: make sure to call 'multiprocessing.freeze_support()' from the __main__
    prior to invoking this function in a frozen application
    """
    global PACKET_START_S, WAV

    HDW_FRAMES_PER_BUFFER = math.ceil(sample_rate * opt.callback_latency_ms.value / 1000)
    NUM_CHUNKS = math.ceil(MAX_INFER_SAMPLES_VC / HDW_FRAMES_PER_BUFFER)
    MAX_RECORD_SEGMENTS = 5 * 60 * sample_rate // HDW_FRAMES_PER_BUFFER  # 5 mins in duration
    # make sure dependencies are updated before starting the pipeline
    _LOGGER.debug(f"MAX_RECORD_SEGMENTS: {MAX_RECORD_SEGMENTS}")
    _LOGGER.debug(f"HDW_FRAMES_PER_BUFFER: {HDW_FRAMES_PER_BUFFER}")
    _LOGGER.debug(f"NUM_CHUNKS: {NUM_CHUNKS}")

    # init
    audio_in = np.zeros((MAX_RECORD_SEGMENTS, HDW_FRAMES_PER_BUFFER), dtype=np.float32)
    audio_out = np.zeros((MAX_RECORD_SEGMENTS, HDW_FRAMES_PER_BUFFER), dtype=np.float32)

    stop_process = Value("i", 0)
    model_warmup_complete = Value("i", 0)
    q_in, q_out = Queue(), Queue()  # TODO sidroopdaska: create wrapper class for multiprocessing:Queue & shared counter
    q_in_counter, q_out_counter = SharedCounter(0), SharedCounter(0)

    # create directory for recordings
    conversion_root = get_conversion_root()
    os.makedirs(conversion_root, exist_ok=True)

    # create rolling deque for io_stream data packets
    data = deque(maxlen=NUM_CHUNKS)
    for _ in range(NUM_CHUNKS):
        in_data = np.zeros(HDW_FRAMES_PER_BUFFER, dtype=np.float32)
        data.append(in_data)

    # run pipeline
    try:
        _LOGGER.info(f"backend={get_device()}")
        _LOGGER.info(f"opt={opt}")

        conversion_process = Process(
            target=conversion_process_target,
            args=(
                stop_process,
                q_in,
                q_out,
                q_in_counter,
                q_out_counter,
                model_warmup_complete,
                opt,
                HDW_FRAMES_PER_BUFFER,
            ),
        )
        conversion_process.start()

        with TimedScope("model_warmup", _LOGGER):
            while not model_warmup_complete.value:
                time.sleep(1)

        io_stream = p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            output=True,
            start=False,
            frames_per_buffer=HDW_FRAMES_PER_BUFFER,
            input_device_index=opt.input_device_idx,
            output_device_index=opt.output_device_idx,
            stream_callback=get_io_stream_callback(
                q_in,
                q_in_counter,
                data,
                audio_in,
                q_out,
                q_out_counter,
                audio_out,
                MAX_RECORD_SEGMENTS,
                latency_queue,
                frame_dropping,
            ),
        )
        io_stream.start_stream()
        PACKET_START_S = time.time()

        # hook for calling process
        if has_pipeline_started is not None:
            with has_pipeline_started.get_lock():
                has_pipeline_started.value = 1

        while not stop_pipeline.value:
            time.sleep(0.2)

    finally:
        with stop_process.get_lock():
            stop_process.value = 1
        conversion_process.join()

        if io_stream:
            io_stream.close()
        p.terminate()

        # empty out the queues prior to deletion
        while not q_in.empty():
            try:
                q_in.get_nowait()
            except Empty:
                pass
        while not q_out.empty():
            try:
                q_out.get_nowait()
            except Empty:
                pass

        del q_in, q_out, q_in_counter, q_out_counter, stop_process, model_warmup_complete
        _LOGGER.info("Done cleaning, exiting.")


if __name__ == "__main__":
    # important for running applications that have been frozen for e.g. with PyInstaller
    multiprocessing.freeze_support()

    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", type=InferencePipelineMode, choices=list(InferencePipelineMode))
    parser.add_argument(
        "--noise-suppression-threshold",
        type=float,
        default=5,
        help="Threshold magnitude value for suppressing noise",
    )
    parser.add_argument(
        "--callback-latency-ms",
        type=float,
        default=400,
        help="Latency",
    )
    parser.add_argument(
        "--session-upload-path",
        type=str,
        default=None,
        help="path to store session audio segments within s3. if provided, data will be uploaded periodically.",
    )
    parser.add_argument("--target-speaker", type=int, default=0)
    opt = parser.parse_args()

    # capture audio io device indices from the user
    input_device_idx, output_device_idx = get_audio_io_indices()

    opt.input_device_idx = input_device_idx
    opt.output_device_idx = output_device_idx
    _LOGGER.info(opt)

    stop_pipeline = Value("i", 0)
    try:
        run_inference_rt(opt, stop_pipeline=stop_pipeline)
    except (KeyboardInterrupt, Exception) as e:
        with stop_pipeline.get_lock():
            stop_pipeline.value = 1
