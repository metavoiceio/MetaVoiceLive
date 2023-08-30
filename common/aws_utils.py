import os

import boto3

ACCESS_KEY = None
SECRET_KEY = None
BUCKET = "BUCKET_TO_PUSH_TO"

S3 = None
if ACCESS_KEY and SECRET_KEY:
    S3 = boto3.client(
        "s3",
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        verify=False,
    )


def upload_directory_to_s3(path: str, object_prefix: str) -> None:
    if not S3:
        return

    assert os.path.exists(path)

    for root, _, files in os.walk(path):
        for file in files:
            filename = os.path.join(root, file)
            S3.upload_file(Filename=filename, Bucket=BUCKET, Key=f"{object_prefix}/{os.path.relpath(filename, path)}")
