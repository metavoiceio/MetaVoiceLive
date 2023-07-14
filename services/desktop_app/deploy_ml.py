import hashlib
import json
import os
import shutil

import boto3
from dotenv import load_dotenv

load_dotenv()

ml_version = json.load(open("package.json"))["config"]["mlVersion"]
platform = "win32" if os.name == "nt" else "darwin"  # matches electron's process.platform
dest_path = f"mvml/mvml-{platform}-{ml_version}.zip"

print(f"preparing to push to {dest_path} ...")
# add version as version.txt to dist
with open("dist/metavoice/version.txt", "w") as f:
    f.write(ml_version)

print("zipping to mvml-local.zip ...")
shutil.make_archive("mvml-local", "zip", "dist")

print("creating sha256 checksum ...")
checksum = hashlib.sha256(open("mvml-local.zip", "rb").read()).hexdigest()
print("checksum:", checksum)

print("initiating s3 ...")
s3c = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("KEY_AWS_ACCESS"),
    aws_secret_access_key=os.getenv("KEY_AWS_SECRET_ACCESS"),
)

print("uploading to s3 ...")
s3c.upload_file("mvml-local.zip", "mv-downloads", dest_path)
s3c.upload_file("mvml-local.zip", "mv-downloads", f"{dest_path}.sha256")

print("done!")
