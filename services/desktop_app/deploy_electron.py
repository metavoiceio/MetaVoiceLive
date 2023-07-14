# cleans the build directory from mvml and zips the electron build.
# assumes `npm run react-package && npm run electron-package-build` has been run

import os
import json

from dotenv import load_dotenv
load_dotenv()

import boto3
import shutil

def deploy():
    el_version = json.load(open("package.json"))["version"]
    # see https://github.com/electron/update.electronjs.org/blob/main/src/asset-platform.js
    platform = 'win32-x64' if os.name == 'nt' else 'darwin'  # matches electron's process.platform
    src_path = f"out/MetaVoice-{platform}"  # TODO test works for other platforms
    dest_path = f"out/MetaVoice-{el_version}-{platform}"

    print(f'cleaning {src_path} ...')
    # remove dist folder
    if os.path.exists(src_path + "/resources/app/dist"):
        print('- removing /resources/app/dist ...')
        shutil.rmtree(src_path + "/resources/app/dist")

    # remove mvml-*.zip files
    for f in os.listdir(src_path + "/resources/app"):
        if f.startswith("mvml-") and f.endswith(".zip"):
            print('- removing /resources/app/' + f + ' ...')
            os.remove(src_path + "/resources/app/" + f)

    print(f'zipping to {dest_path}.zip ...')

    shutil.make_archive(dest_path, "zip", src_path)

    # TODO automatic upload mvml if new version?
    # TODO automatic upload to github?

    print('done! You can upload it as an appendix to the github release.')

if __name__ == '__main__':
    deploy()