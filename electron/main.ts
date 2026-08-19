import { app, BrowserWindow, ipcMain, session } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, "..");
const developmentServerUrl = process.env["VITE_DEV_SERVER_URL"];
let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#050a0f",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, "preload.cjs"),
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (developmentServerUrl === undefined) {
    void window.loadFile(join(projectRoot, "dist", "index.html"));
  } else {
    void window.loadURL(developmentServerUrl);
  }

  return window;
}

ipcMain.handle("window:toggle-fullscreen", (event): boolean => {
  if (mainWindow === null || event.sender.id !== mainWindow.webContents.id) {
    throw new Error("Rejected fullscreen request from an unknown renderer.");
  }

  const fullscreen = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(fullscreen);
  return fullscreen;
});

await app.whenReady();
session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
  callback(false);
});
mainWindow = createWindow();

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
