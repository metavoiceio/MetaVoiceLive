import subprocess
import time

import psutil
from tracking.firebase import FirebaseWriter


def get_process_name(pid):
    try:
        proc = psutil.Process(pid)
        names = {}
        names["pid"] = pid
        names["main"] = proc.name()
        names["children"] = [child.name() for child in proc.children(recursive=True)]
        names["parents"] = [parent.name() for parent in proc.parents()]

        return names
    except:
        return f"PID {pid} not found."


def stream_log(writer: FirebaseWriter):
    # TODO: we can add `LOG_FORMAT=json` if needed.
    proc = subprocess.Popen(
        ["log stream --process coreaudiod"],
        stderr=None,
        stdout=subprocess.PIPE,
        shell=True,
    )

    for line in proc.stdout:
        line = line.decode()

        if "input_device_uid_list" in line:
            writer.write_log(line.strip())

        if " on behalf of " in line:
            pid = int(line.split(" on behalf of ")[1].split(" ")[0])
            writer.write_log(line.split("HALB_PowerAssertion::")[1].split()[0])
            writer.write_log(get_process_name(pid))

        if "session_duration" in line:
            writer.write_log(line.strip())


def end_time(writer: FirebaseWriter):
    while True:
        writer.write_endtime(time.time())
        time.sleep(5)
