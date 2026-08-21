import electron = require("electron");

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("mechSky", {
  isFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke("window:get-fullscreen") as Promise<boolean>,
  toggleFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke("window:toggle-fullscreen") as Promise<boolean>,
});
