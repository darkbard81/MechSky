import { app, BrowserWindow, ipcMain, session } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, "..");
const developmentServerUrl = process.env["VITE_DEV_SERVER_URL"];
let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    useContentSize: true,
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
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (developmentServerUrl === undefined) {
    void window.loadFile(join(projectRoot, "dist", "index.html"));
  } else {
    void window.loadURL(developmentServerUrl);
  }

  return window;
}

function requireTrustedWindow(senderId: number): BrowserWindow {
  if (mainWindow === null || senderId !== mainWindow.webContents.id) {
    throw new Error("Rejected window request from an unknown renderer.");
  }

  return mainWindow;
}

ipcMain.handle("window:get-fullscreen", (event): boolean =>
  requireTrustedWindow(event.sender.id).isFullScreen(),
);

ipcMain.handle("window:toggle-fullscreen", (event): boolean => {
  const window = requireTrustedWindow(event.sender.id);
  const fullscreen = !window.isFullScreen();
  window.setFullScreen(fullscreen);
  return fullscreen;
});

void app
  .whenReady()
  .then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => {
        callback(false);
      },
    );
    mainWindow = createWindow();
  })
  .catch((error: unknown) => {
    console.error("Electron initialization failed.", error);
    app.exit(1);
  });

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
