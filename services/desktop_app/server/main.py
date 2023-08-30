import argparse
import asyncio
import multiprocessing
import multiprocessing as mp
import os
import time
from dataclasses import dataclass
from multiprocessing import Process, Value
from typing import Optional

import numpy as np

# librosa uses the deprecated alias
np.complex = complex

import librosa
import sounddevice as sd
import soundfile as sf
import urllib3
import uvicorn

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import sys

from data_types import DeviceMap
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from portaudio_utils import get_devices

# TODO is this safe? ai wasn't found otherwise, but depending on how this file is loaded,
# it might allow third parties to overwrite # more modules and maybe that's not a big deal
# as they can override the files directly anyway?
sys.path.append('../..')

from ai.spectrogram_conversion.data_types import InferencePipelineMode
from ai.spectrogram_conversion.inference_rt import run_inference_rt
from ai.spectrogram_conversion.params import num_mels, num_samples, sample_rate
from ai.spectrogram_conversion.timedscope import TimedScope, get_logger
from ai.spectrogram_conversion.utils.utils import get_conversion_root
from common.aws_utils import upload_directory_to_s3

_LOGGER = get_logger(__name__)
IS_MOCK = os.environ.get("IS_MOCK", "false") == "true"


@dataclass
class UserState:
    email: str = ""
    issuer: str = ""
    should_capture_data: bool = True


USER_STATE = UserState()
convert_process: Optional[Process] = None
stop_pipeline: Optional[Value] = None
has_pipeline_started: Optional[Value] = None
# TODO sidroopdaska: swap this for application hooks
# TODO sidroopdaska: use mp.Manager.dict
noise_suppression_threshold: Optional[Value] = None
callback_latency_ms: Optional[Value] = None
latency_queue: Optional[multiprocessing.Queue] = None
frame_dropping: Optional[multiprocessing.Queue] = None


def sigterm_handler():
    global convert_process
    if not convert_process:
        return

    convert_process.terminate()


def convert_process_target(
    stop_pipeline: Value,
    has_pipeline_started: Value,
    input_device_idx: int,
    output_device_idx: int,
    noise_suppression_threshold: Value,
    callback_latency_ms: Value,
    target_speaker: str,
    session_upload_path: str,
    latency_queue: multiprocessing.Queue,
    frame_dropping: multiprocessing.Queue,
):
    # TODO sidroopdaska: replace argparse.Namespace with dataclass
    # TODO sidroopdaska: lazy loading of model
    opt = argparse.Namespace(
        mode=InferencePipelineMode.online_crossfade,
        input_device_idx=input_device_idx,
        output_device_idx=output_device_idx,
        noise_suppression_threshold=noise_suppression_threshold,
        callback_latency_ms=callback_latency_ms,
        session_upload_path=session_upload_path,
        target_speaker=target_speaker,
    )

    run_inference_rt(
        opt,
        stop_pipeline=stop_pipeline,
        has_pipeline_started=has_pipeline_started,
        latency_queue=latency_queue,
        frame_dropping=frame_dropping,
    )


########
# FastAPI
########
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])


@app.get("/is-alive")
def get_is_alive():
    return True


@app.get("/device-map")
def get_device_map(mode: str = "all") -> DeviceMap:
    return get_devices(mode)


@app.get("/register-user")
def register_user(email: str, issuer: str, share_data: bool, noise_suppression: float, callback_latency_ms_: int):
    global USER_STATE, noise_suppression_threshold, callback_latency_ms
    USER_STATE.email = email
    USER_STATE.issuer = issuer
    USER_STATE.should_capture_data = share_data

    # double
    noise_suppression_threshold = Value("d", noise_suppression)
    # unsigned int
    callback_latency_ms = Value("I", callback_latency_ms_)
    print(share_data)
    print(type(share_data))
    print(type(noise_suppression))
    print(noise_suppression_threshold.value)
    print(callback_latency_ms.value)
    return True


@app.get("/start-convert")
def get_start_convert(input_device_idx: int, output_device_idx: int, app_version: str, target_speaker: str):
    # not a true session id, but avoids conflicts
    session_id = time.time()

    if IS_MOCK:
        time.sleep(1)
        return True

    with TimedScope("get_start_convert", _LOGGER):
        global convert_process, stop_pipeline, has_pipeline_started, noise_suppression_threshold, callback_latency_ms, latency_queue, frame_dropping

        stop_pipeline = Value("i", 0)
        has_pipeline_started = Value("i", 0)
        latency_queue = multiprocessing.Queue()
        frame_dropping = multiprocessing.Queue()
        convert_process = Process(
            target=convert_process_target,
            args=(
                stop_pipeline,
                has_pipeline_started,
                input_device_idx,
                output_device_idx,
                noise_suppression_threshold,
                callback_latency_ms,
                target_speaker,
                (f"{USER_STATE.email}/{session_id}" if USER_STATE.should_capture_data else None),
                latency_queue,
                frame_dropping,
            ),
        )
        convert_process.start()

        while not has_pipeline_started.value:
            time.sleep(0.2)
        return True


@app.websocket_route("/ws-frame-health")
async def get_latency(websocket: WebSocket):
    await websocket.accept()

    global frame_dropping

    while True:
        if frame_dropping:
            frame_drops = []

            while not frame_dropping.empty():
                frame_drops.append(frame_dropping.get_nowait())

            if len(frame_drops) > 0:
                await websocket.send_json(frame_drops)
            else:
                await asyncio.sleep(1)
        else:
            await asyncio.sleep(1)


# TODO sidroopdaska: use correct HTTP verbs. Using GET right now since its easy to test from the browser
@app.get("/stop-convert")
def get_stop_convert():
    if IS_MOCK:
        time.sleep(1)
        return True

    with TimedScope("get_stop_convert", _LOGGER):
        global convert_process, stop_pipeline, latency_queue
        if not convert_process:
            return True

        latency_records = []
        while not latency_queue.empty():
            latency_records.append(latency_queue.get_nowait())
        if len(latency_records) > 30:
            latency_records = latency_records[-30:]
        latency_records

        with stop_pipeline.get_lock():
            stop_pipeline.value = 1

        convert_process.join(5)
        if convert_process.is_alive():
            convert_process.terminate()

        return {"latency_records": latency_records}


# TODO sidroopdaska: convert to POST or setup a websocket to make more generalisable
@app.get("/noise-suppression-threshold")
def get_noise_suppression_threshold(value: float):
    global noise_suppression_threshold

    with noise_suppression_threshold.get_lock():
        noise_suppression_threshold.value = value
    return True


@app.get("/callback-latency-ms")
def get_callback_latency_ms(value: int):
    global callback_latency_ms

    with callback_latency_ms.get_lock():
        callback_latency_ms.value = value
    return True


@app.get("/data-share")
def get_data_share(value: bool):
    global USER_STATE
    USER_STATE.should_capture_data = value
    return True


@app.get("/audio")
def get_audio(audio_type: str):
    if audio_type not in ["original", "converted"]:
        return HTTPException(status_code=400, detail="Bad request. Wrong `audio_type` requested")

    fname = os.path.join(get_conversion_root(), f"{audio_type}.wav")
    if not os.path.exists(fname):
        return HTTPException(status_code=404, detail=f"Audio {audio_type}.wav does not exist")

    return StreamingResponse(content=open(fname, "rb"), media_type="audio/wav")


# TODO sidroopdaska: POST results in CORS and doesn't work with the react development server
@app.get("/feedback")
def get_feedback(content: str, duration: int):
    global USER_STATE

    # write content to disk
    if content:
        with open(f"{get_conversion_root()}/content.txt", "w") as f:
            f.write(content)

    # trim audio length
    for f in ["original.wav", "converted.wav"]:
        fname = os.path.join(get_conversion_root(), f)
        wav, sr = librosa.load(fname)
        if len(wav) < duration * sample_rate:
            continue
        wav = wav[-(duration * sample_rate) :]
        sf.write(fname, wav, sample_rate)

    # not a true session id, but avoids conflicts
    session_id = time.time()

    # upload to cloud
    upload_directory_to_s3(
        get_conversion_root(),
        object_prefix=f"{USER_STATE.email}/{session_id}",
    )


@app.on_event("shutdown")
def shutdown_event():
    sigterm_handler()


if __name__ == "__main__":
    # required to enable multiprocessing for a bundled application
    multiprocessing.freeze_support()

    # start server
    uvicorn.run(app, host="127.0.0.1", port=58000, log_level="info")
