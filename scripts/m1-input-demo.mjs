import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cdpBaseUrl = process.env.MECHSKY_CDP_URL ?? "http://127.0.0.1:9224";
const captureDirectory = process.env.MECHSKY_CAPTURE_DIR;
const CAPTURE_FRAME_COUNT = 120;
const CAPTURE_INTERVAL_MILLISECONDS = 1_000 / 12;

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findGamePage() {
  const response = await fetch(`${cdpBaseUrl}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP page list failed with HTTP ${response.status}`);
  }

  const targets = await response.json();
  const page = targets.find(
    (target) =>
      target.type === "page" &&
      typeof target.url === "string" &&
      target.url.includes("127.0.0.1"),
  );

  if (page?.webSocketDebuggerUrl === undefined) {
    throw new Error("MechSky CDP page was not found.");
  }

  return page;
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      return;
    }

    const request = pending.get(message.id);
    if (request === undefined) {
      return;
    }

    pending.delete(message.id);
    if (message.error === undefined) {
      request.resolve(message.result);
    } else {
      request.reject(new Error(message.error.message));
    }
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return { send, close: () => socket.close() };
}

const KEY_DATA = {
  KeyD: { key: "d", windowsVirtualKeyCode: 68 },
  KeyW: { key: "w", windowsVirtualKeyCode: 87 },
  Numpad2: { key: "2", windowsVirtualKeyCode: 98, isKeypad: true },
  Numpad4: { key: "4", windowsVirtualKeyCode: 100, isKeypad: true },
  Numpad6: { key: "6", windowsVirtualKeyCode: 102, isKeypad: true },
  ShiftLeft: { key: "Shift", windowsVirtualKeyCode: 16 },
  Tab: { key: "Tab", windowsVirtualKeyCode: 9 },
};

async function main() {
  const page = await findGamePage();
  const client = await createCdpClient(page.webSocketDebuggerUrl);
  const heldCodes = new Set();

  async function evaluate(expression) {
    return client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
  }

  async function waitUntilReady() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await evaluate(
        'document.querySelector("#game-surface")?.dataset.ready ?? "missing"',
      );
      const value = result.result?.value;
      if (value === "true") {
        return;
      }
      if (value === "error") {
        throw new Error("MechSky reported a boot error.");
      }
      await pause(100);
    }

    throw new Error("Timed out waiting for #game-surface[data-ready=true].");
  }

  async function keyEvent(type, code) {
    const data = KEY_DATA[code];
    if (data === undefined) {
      throw new Error(`No CDP key data for ${code}.`);
    }

    await client.send("Input.dispatchKeyEvent", {
      type,
      code,
      key: data.key,
      windowsVirtualKeyCode: data.windowsVirtualKeyCode,
      nativeVirtualKeyCode: data.windowsVirtualKeyCode,
      isKeypad: data.isKeypad ?? false,
      modifiers: code === "ShiftLeft" && type !== "keyUp" ? 8 : 0,
    });
  }

  async function press(code) {
    heldCodes.add(code);
    await keyEvent("rawKeyDown", code);
  }

  async function release(code) {
    heldCodes.delete(code);
    await keyEvent("keyUp", code);
  }

  async function tap(code, milliseconds = 40) {
    await press(code);
    await pause(milliseconds);
    await release(code);
  }

  async function runScenario() {
    await pause(500);

    await press("KeyD");
    await pause(400);
    await tap("ShiftLeft");
    await pause(860);
    await release("KeyD");

    await press("KeyW");
    await press("KeyD");
    await pause(350);
    await tap("Tab");
    await pause(610);
    await release("KeyW");
    await release("KeyD");

    await press("Numpad2");
    await pause(1_000);
    await release("Numpad2");

    await press("Numpad6");
    await pause(300);
    await tap("ShiftLeft");
    await pause(960);
    await tap("ShiftLeft");
    await pause(2_060);
    await release("Numpad6");

    await press("Numpad4");
    await pause(1_600);
    await release("Numpad4");
    await pause(1_200);
  }

  async function captureFrames() {
    if (captureDirectory === undefined) {
      return;
    }

    await mkdir(captureDirectory, { recursive: true });
    const startedAt = performance.now();

    for (let index = 0; index < CAPTURE_FRAME_COUNT; index += 1) {
      const deadline = startedAt + index * CAPTURE_INTERVAL_MILLISECONDS;
      await pause(Math.max(0, deadline - performance.now()));
      const result = await client.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "jpeg",
        fromSurface: true,
        optimizeForSpeed: true,
        quality: 88,
      });
      const sequence = index.toString().padStart(4, "0");
      await writeFile(
        join(captureDirectory, `frame-${sequence}.jpg`),
        Buffer.from(result.data, "base64"),
      );
    }
  }

  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    if (captureDirectory !== undefined) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 768,
        mobile: false,
        screenHeight: 768,
        screenWidth: 1024,
        width: 1024,
      });
    }
    await waitUntilReady();
    await Promise.all([runScenario(), captureFrames()]);

    const result = await evaluate(`JSON.stringify({
      ready: document.querySelector("#game-surface")?.dataset.ready,
      playerState: document.querySelector("#game-surface")?.dataset.playerState,
      playerX: document.querySelector("#game-surface")?.dataset.playerX,
      playerY: document.querySelector("#game-surface")?.dataset.playerY,
      input: document.querySelector("#input-source")?.textContent,
      target: document.querySelector("#target-lock")?.textContent
    })`);
    console.log(
      JSON.stringify({
        captureFrames:
          captureDirectory === undefined ? 0 : CAPTURE_FRAME_COUNT,
        state: JSON.parse(result.result?.value ?? "null"),
      }),
    );
  } finally {
    for (const code of heldCodes) {
      await keyEvent("keyUp", code).catch(() => undefined);
    }
    client.close();
  }
}

await main();
