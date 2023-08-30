const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    getAppMode: () => {
        return ipcRenderer.invoke('request-app-mode', null);
    },
    getAppVersion: () => {
        return ipcRenderer.invoke('request-app-version', null);
    },
    getUserSpeakers: () => {
        return ipcRenderer.invoke('request-user-speakers', null);
    },
    getLogs: () => {
        return ipcRenderer.invoke('request-logs', null);
    },
    onLogInfo: (func) => {
        ipcRenderer.on('log-info', (event, ...args) => func(...args));
    },
    onLogError: (func) => {
        ipcRenderer.on('log-error', (event, ...args) => func(...args));
    },
})