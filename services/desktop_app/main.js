// Modules to control application life and create native browser window
const {app, BrowserWindow, shell, systemPreferences, ipcMain, protocol } = require('electron');
const path = require('path');
const IS_DEV = process.env.NODE_ENV === 'dev';
const windowStateKeeper = require('electron-window-state');

const fs = require('fs');
const request = require("request");
const { URL } = require("url");

const unzipper = require('unzipper');
const package = require('./package.json');
const { deferPromise, checkNeedsNewVersion, findFreePort, notify, warnOnUnsupportedPlatform, updateMvml } = require('./util');

ipcMain.handle('request-app-version', async (event, ...args) => {
    return app.getVersion();
});

// TODO log to file.
// electron-log had odd issues, should look for another solution

let mainWindow = null;
const mainWindowPromise = deferPromise();
// the http server behind the express server
let frontendServerApp = null;
let portPromise = IS_DEV ? Promise.resolve(3000) : findFreePort(3000);

warnOnUnsupportedPlatform();

// 'app' | 'update'
let appMode = 'app';

ipcMain.handle('request-app-mode', () => {
  console.log('app mode requested by frontend, sending: ', appMode);
  return appMode;
});

ipcMain.handle('request-user-speakers', async (event, ...args) => {
  // add user speakers from `app.path('userData')/speakers/<name>.npy`.

  const userDataSpeakers = [];
  const userDataSpeakersPath = path.join(app.getPath('userData'), 'speakers');
  try {
    await fs.promises.access(userDataSpeakersPath);
    const files = await fs.promises.readdir(userDataSpeakersPath);
    for (const file of files) {
      if (file.endsWith('.npy')) {
        const basename = path.basename(file, '.npy');
        userDataSpeakers.push({ id: basename, name: basename, user: true });
      }
    }
  } catch (err) {
    console.error('Error accessing user data speakers path, will revert to base speakers:', err);
  }

  return userDataSpeakers;
})

if (!IS_DEV || process.env.DEBUG_OTA === 'true') {
  try {
    const needsUpdate = setupUpdates({
      mlServer: 'https://mv-downloads.s3.eu-west-1.amazonaws.com/mvml',
      mlVersion: package.config.mlVersion,
    });

    if (needsUpdate) {
      // ml update, not electron
      appMode = 'update';
    }
  } catch (e) {
    console.error('Error setting up updates, probably no internet, will continue without updates');
    console.log(e);
  }
}

let forceQuit = false;

if (process.platform === 'darwin') {
  systemPreferences.askForMediaAccess('microphone')
    .then(granted => console.log(`Microphone access granted: ${granted}`))
    .catch(error => console.log(error))
}
  
function createWindow() {
  const defaultHeight = process.platform === 'darwin' ? 680 : 720;
  let mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.defaultWidth,
    height: defaultHeight,
    resizable: IS_DEV,
    webPreferences: {
      devTools: IS_DEV,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#232234',
    // hide titlebar on mac only
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default'
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !forceQuit) {
      /* the user only tried to close the window */
      e.preventDefault();
      mainWindow.hide();
    }
  });

  portPromise.then(port => {
    mainWindow.loadURL(`http://localhost:${port}/`)
  });

  // opens URLs in the default browser
  mainWindow.webContents.on('new-window', function(e, url) {
    e.preventDefault();
    shell.openExternal(url);
  });
  // open dev tools by default in dev mode
  if (IS_DEV) {
    mainWindow.webContents.openDevTools();
  }
  mainWindowState.manage(mainWindow);

  mainWindowPromise.resolve();

  return mainWindow;
}

let pyProc = null

function createPyProc() {
  if (IS_DEV) {
    pyProc = require('child_process').spawn('python', ['server/main.py']);
  } else {
    const file = path.join(path.resolve(__dirname), './dist/metavoice/metavoice');
    pyProc = require('child_process').execFile(file, (error, stdout, stderr) => {
      if (error) {
        throw error;
      }
      console.log(stdout);
    });
  }
  
  pyProc.stdout.pipe(process.stdout);
  pyProc.stderr.pipe(process.stderr);

  if (pyProc) {
    console.log('Child process started successfully!')
  }
}

function createFrontendServer() {
  const express = require('express');
  const frontendApp = express();

  frontendApp.use(express.static(path.join(__dirname, 'dist-react')));

  portPromise.then((port) => {
    frontendServerApp = frontendApp.listen(port, () => {
      console.log(`Localhost frontend server listening at http://localhost:${port}`)
    });
  });
}
function exitFrontendServer() {
  if (!frontendServerApp) return Promise.resolve();

  return frontendServerApp.close();
}

async function exitApp() {
  exitFrontendServer();

  if (!pyProc) return;

  // kill the fast api server
  pyProc.kill();
  pyProc = null;

  // process.kill() doesn't issue a SIGTERM. Hence, we run the below bash command to kill all metavoice processes.
  // TODO sidroopdaska: understand behaviour on windows and assess if fix is needed.
  const exec = require('child_process').exec;
  if (process.platform === 'darwin') {
    await exec("pkill -9 'metavoice'");
  } else {
    await exec("taskkill /f /t /im MetaVoice.exe");
  }

  console.log('Shut down child process');

  app.exit();
}

function setupUpdates(obj) {
  const { 
    mlServer,
    mlVersion,
  } = obj;

  const logs = [];
  const log = (msg) => {
    console.log(msg);
    logs.push({ type: 'log', msg });
    mainWindow && mainWindow.webContents.send('log-info', { msg });
  };
  const logError = (msg, error) => {
      console.error(msg);
      console.error(error);
      logs.push({ type: 'error', msg, error });
      mainWindow && mainWindow.webContents.send('log-error', { msg, error });
  };

  ipcMain.handle('request-logs', () => {
    return logs;
  });

  // electron
  try {
    const alreadyInstalledNewVersionLocation = fs.readFileSync(path.join(__dirname, 'use-new-version.txt'), 'utf-8');
    if (alreadyInstalledNewVersionLocation) {
      // prevent user from opening current app, and open the new one for them
      try {
        log('el update: new version already installed, opening it');
        const newAppPath = path.join(alreadyInstalledNewVersionLocation, `MetaVoice.${process.platform === 'darwin' ? 'app' : 'exe'}`);
        log(`el update: new app path: ${newAppPath}`);
        notify({
          title: 'MetaVoice update',
          body: `New version was installed. Opening it now...`,
        })

        // close frontend server to free up port for new app
        exitFrontendServer()
          .then(() => {
            shell.openPath(newAppPath);

            setTimeout(() => {
              // if we exit right away, the new app won't have time to open
              app.exit();
            }, 2000);
          })
          .catch((e) => {
            logError('el update: new version was installed, but could not be opened due to the frontend server being uncloseable', e);
          })

        return true;
      } catch (e) {
        logError('el update: new version was installed, but could not be opened', e);
        log('el update: if you think there was mistake while updating, please remove `resources/app/use-new-versbion.txt`, and restart this app. This will re-install the new version')
        notify({
          title: 'MetaVoice update',
          body: `New version was installed, but could not be opened. Please open it manually at ${newAppPath}`,
        })
        return false;
      }
    }
  } catch (e) {
    // new version wasn't installed if present
  }
  const elServer = 'https://update.electronjs.org';
  const elFeed = `${elServer}/metavoicexyz/MetaVoiceLive/${process.platform}-${process.arch}/${app.getVersion()}`;

  log(`el update: checking for new versions at ${elFeed}`);
  fetch(elFeed)
    .then((res) => {
      if (res.status === 204) {
        return false;
      }
      return res.json();
    })
    .then((update) => {
      if (!update) {
        log('el update: no new versions available. Please don\'t close the window, mvml updates may be processing');
        return;
      }

      const {
        name,
        notes,
        url: updateUrl,
      } = update;

      // download zip file to Download folder, with given name
      const url = new URL(updateUrl);
      // e.g. MetaVoice-0.0.0-win32-x64
      const pkgName = url.pathname.split('/').pop().split('.').slice(0, -1).join('.');

      const downloadDestination = path.resolve(`${app.getPath('downloads')}/${pkgName}.zip`)
      const destination = path.resolve(`${app.getPath('downloads')}/${pkgName}`)

      notify({
        title: 'MetaVoice Update',
        body: `New version ${name} available! Downloading in the background ...`,
      })
      log(`el update: new version "${name}" available! Downloading from ${url} into ${downloadDestination}`);
      let ellipsedNotes = notes.split('\n').slice(0, 6);
      if (ellipsedNotes.length === 6) {
        ellipsedNotes[5]('...');
      }
      ellipsedNotes = '  ' + ellipsedNotes.join('  \n');
      log(`el update notes from new version:\n${ellipsedNotes}`);

      if (fs.existsSync(downloadDestination)) {
        log(`el update: file already exists at ${downloadDestination}, will remove and re-download`);
        fs.rmSync(downloadDestination);
      }

      const fileStream = fs.createWriteStream(downloadDestination, { flags: 'wx' });
      request(updateUrl).pipe(fileStream)

      fileStream.on('error', () => {
        notify({
          title: 'MetaVoice Update',
          body: `Error downloading new version ${name}!`,
        })
        logError(`el update: error downloading new version "${name}"!`, e);
      });

      fileStream.on('finish', () => {
        notify({
          title: 'MetaVoice Update',
          body: `New version ${name} downloaded! Installing in the background ...`,
        })
        log(`el update: downloaded new version "${name}"!`);

        // could pipe in directly from request, but this makes debugging easier, allows caching, and better progress updates for user
        const stream = fs.createReadStream(downloadDestination).pipe(unzipper.Extract({ path: destination }));
        const unzipPromise = new Promise((resolve, reject) => {
          stream.on('finish', resolve);
          stream.on('error', reject);
        });
        unzipPromise.catch((err) => {
          notify({
            title: 'MetaVoice Update',
            body: `Error installing new version ${name}!`,
          })
          log('el update: fatal error decompressing the electron app, please report this to gm@themetavoice.xyz', err);
        });

        const markAsOutdatedPromise = unzipPromise.then(() => {
          // add `use-new-version.txt` file in current folder, which will be detected on boot telling the user to use the new version
          const useNewVersionPath = path.resolve(`${__dirname}/use-new-version.txt`);
          fs.writeFileSync(useNewVersionPath, destination);
          log(`el update: noted new version location in ${useNewVersionPath}`);
        });
        markAsOutdatedPromise.catch((err) => {
          logError('el update: error marking new version as outdated, please report this to gm@themetavoice.xyz', err);
        });

        
        const _endPromise = markAsOutdatedPromise.then(() => {
            notify({
              title: 'MetaVoice Update',
              body: `New version ${name} installed! Please open the executable in ${destination} to use the new version! Feel free to delete this version`,
            })
            log(`el update: success! Please open the executable in ${destination} to use the new version! Feel free to delete this version`)
          })
        });
    });
  

  // ml model
  const { needsNewVersion, reason } = checkNeedsNewVersion(mlVersion);

  if (needsNewVersion) {
    log(`mvml update: new version of ml model required! ${reason}`);

    // will do in a loop until it works
    updateMvml({
      mlVersion,
      mlServer,
      log,
      logError,
      retriesLeft: 10,
    });
  }

  return needsNewVersion;
}

function handleCustomProtocol(url) {
  console.log("recieved custom protocol req, url: ", url);

  //NOTE: we can just redirect to home, no need for magicLink, it's only so the URI is valid
  url.replace("magicLink", "");

  console.log("globalPort:", (IS_DEV ? 3000 : frontendServerApp.address()?.port) ? "found port" : "using default 3000")

  console.log(
    "Loading:",
    `http://localhost:${IS_DEV ? 3000 : frontendServerApp.address()?.port ?? 3000}/` + url.slice("metavoice://".length)
  );
  mainWindow.loadURL(
    `http://localhost:${IS_DEV ? 3000 : frontendServerApp.address()?.port ?? 3000}/` + url.slice("metavoice://".length)
  );
}

console.log(process.execPath);
// remove so we can register each time as we run the app.
app.removeAsDefaultProtocolClient("app");
var didProtocolSucceed;
// If we are running a non-packaged version of the app && on windows
if (
  (process.env.NODE_ENV === "development" && process.platform === "win32") ||
  (process.defaultApp && process.argv.length >= 2)
) {
  // Set the path of electron.exe and your app.
  // These two additional parameters are only available on windows.
  didProtocolSucceed = app.setAsDefaultProtocolClient(
    "metavoice",
    process.execPath,
    [path.resolve(process.argv[1])]
  );
} else {
  //TODO On macOS and Linux, this feature will only work when your app is packaged. It will not work when you're launching it in development from the command-line. When you package your app you'll need to make sure the macOS Info.plist and the Linux .desktop files for the app are updated to include the new protocol handler. Some of the Electron tools for bundling and distributing apps handle this for you.
  didProtocolSucceed = app.setAsDefaultProtocolClient("metavoice");
}
console.log("didProtocolSucceed?: ", didProtocolSucceed);
//TODO (this is not a TODO, its to highlight that below is to handle custom protocol for MACOS)
app.on("open-url", (event, url) => {
  event.preventDefault();
  // handle the data
  handleCustomProtocol(url);
});
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  //TODO (this is not a TODO, its to highlight that below is to handle custom protocol for WINDOWS & LINUX)
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // the commandLine is array of strings in which last element is deep link url
    handleCustomProtocol(commandLine.at(commandLine.length - 1));
  });

  // Create mainWindow, load the rest of the app, etc...

  app.whenReady().then(() => {
    if (appMode === "app") {
      createPyProc();
    }
    if (!IS_DEV) {
      createFrontendServer();
    }
    const window = createWindow();
    protocol.handle("metavoice", (request) => {
      console.log("handling metavoice protocol:", request);
      handleCustomProtocol(request.url);
    });

    console.log(
      "isprotocolhandled?: ",
      protocol.isProtocolHandled("metavoice")
    );
    app.on("activate", () => mainWindow.show());
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', exitApp)

app.on('before-quit', () => forceQuit = true);