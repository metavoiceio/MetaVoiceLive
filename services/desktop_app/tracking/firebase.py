import time
from datetime import datetime

import requests


class FirebaseWriter:
    def __init__(self, cloud_fn_url, email):
        self.cloud_fn_url = cloud_fn_url
        self.email = email
        self.session_id = None
        self._create_session_id()
        self.counter = 0

    def _create_session_id(self):
        assert self.session_id is None
        self.session_id = datetime.now().strftime("%Y-%m-%d--%H-%M-%S")

    def write_log(self, data: str):
        log_path = f"/users/{self.email}/sessions/{self.session_id}/logdata/{self.counter}"
        self._write(log_path, {"data": data})
        self.counter += 1

    def write_starttime(self, time):
        path = f"/users/{self.email}/sessions/{self.session_id}/endtoendmetrics/starttime"
        self._write(path, {"time": time})

    def write_endtime(self, time):
        path = f"/users/{self.email}/sessions/{self.session_id}/endtoendmetrics/endtime"
        self._write(path, {"time": time})

    def write_sysinfo(self, data: dict):
        sysinfo_path = f"/users/{self.email}/sessions/{self.session_id}/sysinfo/info"
        self._write(sysinfo_path, data)

    def _write(self, path, data):
        if len(path.strip("/").split("/")) % 2 != 0:
            raise Exception(f"The firestore path {path} points to a collection, not a document.")

        payload = {"path": path, "data": data}
        print(payload)

        r = requests.post(
            self.cloud_fn_url,
            json=payload,
            # The .pkg version of the app (note: not the .dmg version) causes an error
            # relating to CA certifications, so we switch this off via `verify=False`.
            verify=False,
        )

        print(r, r.text)


class MetaVoiceMetricsWriter(FirebaseWriter):
    def __init__(self, email):
        cloud_fn_url = "https://us-central1-metavoice-alpha.cloudfunctions.net/tracking"
        super().__init__(cloud_fn_url, email)


def test():
    print("Running tests.")

    temp_email = "temp-user@temp.com"

    temp_writer = MetaVoiceMetricsWriter(temp_email)

    temp_writer.write_starttime(time.time())  # TODO

    temp_writer.write_log("something something")

    temp_writer.write_log("something something 2")

    temp_writer.write_sysinfo({"python": 3.9})  # TODO

    temp_writer.write_endtime(time.time())  # TODO


if __name__ == "__main__":
    test()
