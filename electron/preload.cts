import electron = require("electron");

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("mechSky", {
  toggleFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke("window:toggle-fullscreen") as Promise<boolean>,
});
