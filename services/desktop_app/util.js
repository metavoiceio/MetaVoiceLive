const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const unzipper = require('unzipper');
const request = require("request");
const { app, Notification } = require('electron');
const si = require('systeminformation');

function deferPromise() {
    const bag = {};
    return Object.assign(new Promise((resolve, reject) => {
        bag.resolve = resolve;
        bag.reject = reject;
    }), bag);
}

function checkNeedsNewVersion(mlVersion) {
  const currentMlVersionPath = path.resolve(`${__dirname}/dist/metavoice/version.txt`);
  const unzipFinishedCheck = path.resolve(`${__dirname}/dist/.unzip-finished`);
  let currentVersion = 'none'
  try {
    currentVersion = fs.readFileSync(currentMlVersionPath, 'utf-8');

    if (!fs.existsSync(unzipFinishedCheck)) {
      // unzip did not complete
      return { needsNewVersion: true, reason: 'unzip did not finish' };
    }

    if (currentVersion === 'local') {
        return { needsNewVersion: false, reason: 'local version' };
    }
    // current major, minor, patch
    const [cM, cm, cp] = currentVersion.split('.').map(Number);
    // requested major, minor, patch
    const [rM, rm, rp] = mlVersion.split('.').map(Number);

    // major: upgrade or downgrade
    // minor: upgrade only
    // patch: upgrade only
    return {
        needsNewVersion: cM !== rM || cm < rm || (cm === rm && cp < rp),
        reason: `current version ${currentVersion} is not compatible with requested version ${mlVersion}`
    };
  } catch (e) {
    // if no version file exists or wasn't parseable, force upgrade.
    return {
        needsNewVersion: true,
        reason: 'no valid mvml installation detected'
    };
  }
}

// check whether port is available for use, if not, increment by 1 and try again.
function findFreePort(port) {
  return new Promise((resolve, reject) => {
      const server = require('http').createServer();
      server.on('error', reject);
      server.listen(port, () => {
          server.close(() => {
              resolve(port);
          });
      });
  }).catch(() => {
      return findFreePort(port + 1);
  });
}

function notify({ title, body }) {
  if (app.isReady()) {
    new Notification({
      title,
      body,
    }).show();
  } else {
    app.on('ready', () => {
      new Notification({
        title,
        body,
      }).show();
    });
  }
}

// right now we only officially support windows with intel cpu and nvidia gpu
async function warnOnUnsupportedPlatform() {
  let warned = false;
  const warnBadPlatform = (reason) => {
    if (warned) return;
    warned = true;

    notify({
      title: 'Unsupported Platform',
      body: `MetaVoice currently only officially supports Windows 10+ with an Intel CPU and Nvidia GPU. ${reason}. Some features may still work.`,
    });
  }

  if (process.platform !== 'win32') {
    warnBadPlatform('You are not on Windows')
    return;
  }

  if (process.arch !== 'x64') {
    warnBadPlatform('You are not on a 64-bit machine')
    return;
  }

  si.graphics().then(data => {
    if (!data.controllers.some(c => c.vendor.includes('NVIDIA'))) {
      warnBadPlatform('Your GPU is not Nvidia')
    }
  });

  si.cpu().then(data => {
    if (!data.manufacturer.includes('Intel')) {
      warnBadPlatform('Your CPU is not Intel')
    }
  });
}

async function updateMvml(opts) {
  const {
    mlVersion,
    mlServer,
    log,
    logError,
    retriesLeft,
  } = opts;

  if (retriesLeft <= 0) {
    logError('mvml update: retried too many times, aborting. Please contact gm@themetavoice.xyz for help');
    return;
  }

  try {
    const pkgName = `mvml-${process.platform}-${mlVersion}.zip`
    const downloadDestination = path.resolve(`${app.getPath('downloads')}/${pkgName}`)
    const destination = path.resolve(`${__dirname}/dist`);

    // delete previous installation if present
    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true });
    }

    const alreadyDownloadedVersion = fs.existsSync(downloadDestination);

    if (!alreadyDownloadedVersion) {
      const fileStream = fs.createWriteStream(downloadDestination, { flags: 'wx' });

      log(`mvml update: model not found locally, downloading ml model ${pkgName}...`);

      try {
        await new Promise((resolve, reject) => {
          const url = new URL(mlServer + '/' + pkgName);
          // node-fetch and axios both created dependency issues, so using native modules instead.
          const pipe = request(mlServer + '/' + pkgName)
            .pipe(fileStream);
          pipe.on('finish', resolve);
          pipe.on('error', reject);
        });
      } catch (err) {
        if (err.res && err.res.statusCode === 403) {
          // file is not existing/accessible
          logError('mvml update: ml model not found on server (403 response)', err);
        }
        
        // delete the mvml file
        fs.rmSync(downloadDestination);
        throw err;
      }
    } else {
      log('mvml update: ml model already downloaded, skipping download')
    }

    log('mvml update: ml model downloaded, checking integrity ...');
    try {
      // get checksum of stored file, and compare to checksum of file on server
      const checksum = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(downloadDestination);
        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
      });
      log(`mvml update: ml model checksum from local zip file calculated as ${checksum}`);

      log(`mvml update: downloading expected checksum from server ...`);
      const checksumResponse = await fetch(`${mlServer}/${pkgName}.sha256`);
      const checksumText = await checksumResponse.text();
      const checksumServer = checksumText.trim().split(' ')[0];

      if (checksum !== checksumServer) {
        logError(`mvml update: checksum mismatch, expected ${checksumServer}, got ${checksum}`);
        log(`mvml update: deleting downloaded ml model to try download again ...`);
        fs.rmSync(downloadDestination);
        throw new Error(`checksum mismatch, expected ${checksumServer}, got ${checksum}`);
      } else {
        log(`mvml update: ml model checksum from server matches local checksum, continuing ...`)
      }
    } catch (err) {
      logError('mvml update: fatal error checking integrity of the ml model', err);
      throw err;
    }
    
    log('mvml update: ml model stored, unzipping ...');
    try {
      // could pipe in directly from fetch, but this makes debugging easier, allows caching, and better progress updates for user
      const stream = fs.createReadStream(downloadDestination).pipe(unzipper.Extract({ path: destination }));
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // create file to indicate the unzipping has definitely finished
      fs.writeFileSync(path.resolve(`${destination}/.unzip-finished`), 'true');
    } catch (err) {
      logError('mvml update: fatal error unzipping the ml model', err);
      throw err;
    }

    log('mvml update: ml model unzipped, validating result ...');

    const { needsNewVersion, reason } = checkNeedsNewVersion(mlVersion);

    if (needsNewVersion) {
      throw new Error(`installation not valid: ${reason}`);
    }

    log('mvml update: success! Restarting the app in 5 seconds. If it doesn\'t restart, please let us know and try to restart it manually.')

    setTimeout(() => {
      app.relaunch();
      app.exit();
    }, 5000);
  } catch (err) {
    logError('mvml update: fatal error updating the ml model, please report this to gm@themetavoice.xyz', err);
    log(`mvml update: will now attempt to update again (${retriesLeft} left)`);
    log(`mvml update: =====================================================================================`);
    updateMvml({
      ...opts,
      retriesLeft: retriesLeft - 1,
    })
  }
}

module.exports = {
    deferPromise,
    checkNeedsNewVersion,
    updateMvml,
    findFreePort,
    notify,
    warnOnUnsupportedPlatform
}