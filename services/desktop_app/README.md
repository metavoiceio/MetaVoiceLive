# MetaVoice Live: Real-time Voice Conversion desktop app

Cross-platform native desktop app that allows the user to convert their voice in real-time to a target voice.


## How to run?
* Install dependencies: `npm install`

* Dev mode: `npm start`
* Prod mode: 
  * Package server: `make build-server-windows`
  * Package electron: `npm run package`

### Adding a voice
You should add the .npy file we provide to `%APPDATA%/speakers/`, on windows.
-- add some guidance here

## Deploy
### MVML - MetaVoice ML server

```sh
make build-server-windows

# manually update `config.mlVersion` in package.json

# this will create the zip file and upload it to s3
python deploy_ml.py
```

That's all. A new MVML server deployment doesn't automatically cause older user instances to update, you'll need to deploy the electron package
with the updated `config > mlVersion` in package.json

### Electron
```sh
# If anything in the frontend changed, including assets/html/css/react. Also on first build
npm run react-package

# manually update `version` in package.json

# populates the out/ dir
npm run electron-package-win

# cleans the destination dir from evidence of usage, and zips the file with the right version.
# To be safe when deploying, you might want to rebuild after usage, or MVML and other files might be included
python deploy_electron.py
```

Now you can use the zip file at the location specified in the logs of the last command, and manually upload it as a latest release to https://github.com/metavoicexyz/MetaVoiceLive/releases .

Don't change the file name. Make sure the release tag is valid semver, e.g. `v1.2.3`.

The update mechanism is dependent on `metavoicexyz/MetaVoiceLive` being the repo you release to, and this repo being public. The repo itself doesn't need to contain any code. 