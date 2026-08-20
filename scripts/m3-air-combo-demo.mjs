import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cdpBaseUrl = process.env.MECHSKY_CDP_URL ?? "http://127.0.0.1:9225";
const captureDirectory = process.env.MECHSKY_CAPTURE_DIR;
const proofDirectory = process.env.MECHSKY_PROOF_DIR;
const CAPTURE_FRAME_COUNT = 180;
const CAPTURE_INTERVAL_MILLISECONDS = 1_000 / 15;

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
  KeyA: { key: "a", windowsVirtualKeyCode: 65 },
  KeyD: { key: "d", windowsVirtualKeyCode: 68 },
  KeyJ: { key: "j", windowsVirtualKeyCode: 74 },
  KeyK: { key: "k", windowsVirtualKeyCode: 75 },
  KeyW: { key: "w", windowsVirtualKeyCode: 87 },
  Numpad2: { key: "2", windowsVirtualKeyCode: 98, isKeypad: true },
  ShiftLeft: { key: "Shift", windowsVirtualKeyCode: 16 },
};

async function main() {
  const page = await findGamePage();
  const client = await createCdpClient(page.webSocketDebuggerUrl);
  const heldCodes = new Set();
  const timeline = [];

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
      if (result.result?.value === "true") {
        return;
      }
      if (result.result?.value === "error") {
        throw new Error("MechSky reported a boot error.");
      }
      await pause(100);
    }
    throw new Error("Timed out waiting for the battle surface.");
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

  async function tap(code, milliseconds = 38) {
    await press(code);
    await pause(milliseconds);
    await release(code);
  }

  async function readState() {
    const result = await evaluate(`JSON.stringify((() => {
      const data = document.querySelector("#game-surface")?.dataset ?? {};
      return {
        action: data.playerAttack,
        actionFrame: data.playerActionFrame,
        attackPhase: data.playerAttackPhase,
        combo: data.comboHits,
        enemyElevation: data.enemyElevation,
        enemyHealth: data.enemyHealth,
        enemyLocomotion: data.enemyLocomotion,
        enemyX: data.enemyX,
        enemyY: data.enemyY,
        playerElevation: data.playerElevation,
        playerLocomotion: data.playerLocomotion,
        playerState: data.playerState,
        playerX: data.playerX,
        playerY: data.playerY,
      };
    })())`);
    const raw = JSON.parse(result.result?.value ?? "{}");
    return {
      ...raw,
      actionFrame: Number(raw.actionFrame),
      enemyElevation: Number(raw.enemyElevation),
      enemyHealth: Number(raw.enemyHealth),
      enemyX: Number(raw.enemyX),
      enemyY: Number(raw.enemyY),
      playerElevation: Number(raw.playerElevation),
      playerX: Number(raw.playerX),
      playerY: Number(raw.playerY),
    };
  }

  async function waitFor(label, predicate, timeoutMilliseconds = 4_000) {
    const deadline = performance.now() + timeoutMilliseconds;
    while (performance.now() < deadline) {
      const state = await readState();
      if (predicate(state)) {
        timeline.push({ label, ...state });
        return state;
      }
      await pause(16);
    }
    throw new Error(`${label} was not reached: ${JSON.stringify(await readState())}`);
  }

  async function screenshot(name) {
    if (proofDirectory === undefined) {
      return;
    }
    await mkdir(proofDirectory, { recursive: true });
    const result = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(join(proofDirectory, name), Buffer.from(result.data, "base64"));
  }

  async function approachTarget(range) {
    for (let step = 0; step < 50; step += 1) {
      const state = await readState();
      const dx = state.enemyX - state.playerX;
      const dy = state.enemyY - state.playerY;
      if (Math.hypot(dx, dy) <= range) {
        timeline.push({ label: "in-range", ...state });
        return;
      }

      const code =
        Math.abs(dx) >= Math.abs(dy)
          ? dx > 0
            ? "KeyD"
            : "KeyA"
          : dy > 0
            ? "Numpad2"
            : "KeyW";
      await press(code);
      await pause(90);
      await release(code);
    }
    throw new Error("Could not approach the training target.");
  }

  async function runScenario() {
    await pause(400);
    await approachTarget(100);

    await tap("KeyJ");
    await waitFor(
      "ground-1",
      (state) =>
        state.action === "mech-ground-1" &&
        state.attackPhase === "recovery" &&
        state.enemyHealth === 840,
    );

    await tap("KeyJ");
    await waitFor(
      "ground-2",
      (state) =>
        state.action === "mech-ground-2" &&
        state.attackPhase === "recovery" &&
        state.enemyHealth === 750,
    );

    await tap("KeyK");
    await waitFor(
      "launcher",
      (state) =>
        state.action === "mech-launcher" &&
        state.attackPhase === "recovery" &&
        state.enemyElevation > 0 &&
        state.enemyHealth === 675,
    );
    await screenshot("launcher-airborne.png");

    await tap("ShiftLeft");
    await waitFor(
      "homing-chase",
      (state) =>
        state.playerLocomotion === "airborne" && state.playerState === "dashing",
    );
    await screenshot("homing-chase.png");

    await waitFor("air-range", (state) => {
      const planeDistance = Math.hypot(
        state.enemyX - state.playerX,
        state.enemyY - state.playerY,
      );
      return (
        planeDistance < 105 &&
        Math.abs(state.enemyElevation - state.playerElevation) < 58
      );
    });

    await tap("KeyJ");
    await waitFor(
      "air-1",
      (state) =>
        state.action === "mech-air-1" &&
        state.attackPhase === "recovery" &&
        state.enemyHealth === 625,
    );

    await tap("KeyJ");
    await waitFor(
      "air-2",
      (state) =>
        state.action === "mech-air-2" &&
        state.attackPhase === "recovery" &&
        state.enemyHealth === 560,
    );
    await screenshot("air-combo.png");

    await tap("KeyK");
    await waitFor(
      "finisher-hit",
      (state) => state.action === "mech-finisher" && state.enemyHealth === 420,
    );
    await waitFor(
      "ground-slam",
      (state) => state.enemyLocomotion === "downed",
    );
    await screenshot("ground-slam.png");

    await waitFor(
      "wake-up",
      (state) => state.enemyLocomotion === "grounded" && state.enemyHealth === 420,
    );
    await pause(1_000);
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
      await writeFile(
        join(captureDirectory, `frame-${String(index).padStart(4, "0")}.jpg`),
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
    await client.send("Page.reload", { ignoreCache: false });
    await pause(300);
    await waitUntilReady();
    await Promise.all([runScenario(), captureFrames()]);
    process.stdout.write(`${JSON.stringify({ timeline }, null, 2)}\n`);
  } finally {
    for (const code of heldCodes) {
      await keyEvent("keyUp", code).catch(() => undefined);
    }
    client.close();
  }
}

await main();
