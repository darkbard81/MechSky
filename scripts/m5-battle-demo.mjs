import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cdpBaseUrl = process.env.MECHSKY_CDP_URL ?? "http://127.0.0.1:9226";
const captureDirectory = process.env.MECHSKY_CAPTURE_DIR;
const proofDirectory = process.env.MECHSKY_PROOF_DIR;
const timelineFile = process.env.MECHSKY_TIMELINE_FILE;
const mode = process.env.MECHSKY_M5_MODE ?? "victory";
const inputMode = process.env.MECHSKY_M5_INPUT ?? "keyboard";
const evidencePrefix = inputMode === "gamepad" ? `${mode}-gamepad` : mode;
const CAPTURE_INTERVAL_MILLISECONDS = 100;
const MAX_CAPTURE_FRAMES = 900;

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
  Enter: { key: "Enter", windowsVirtualKeyCode: 13 },
  Escape: { key: "Escape", windowsVirtualKeyCode: 27 },
  KeyA: { key: "a", windowsVirtualKeyCode: 65 },
  KeyD: { key: "d", windowsVirtualKeyCode: 68 },
  KeyX: { key: "x", windowsVirtualKeyCode: 88 },
  KeyZ: { key: "z", windowsVirtualKeyCode: 90 },
  KeyW: { key: "w", windowsVirtualKeyCode: 87 },
  Numpad2: { key: "2", windowsVirtualKeyCode: 98, isKeypad: true },
  ShiftLeft: { key: "Shift", windowsVirtualKeyCode: 16 },
  Tab: { key: "Tab", windowsVirtualKeyCode: 9 },
};

async function main() {
  if (mode !== "victory" && mode !== "defeat") {
    throw new Error("MECHSKY_M5_MODE must be 'victory' or 'defeat'.");
  }
  if (inputMode !== "keyboard" && inputMode !== "gamepad") {
    throw new Error("MECHSKY_M5_INPUT must be 'keyboard' or 'gamepad'.");
  }
  if (inputMode === "gamepad" && mode !== "defeat") {
    throw new Error("The gamepad evidence path currently supports defeat mode only.");
  }

  const page = await findGamePage();
  const client = await createCdpClient(page.webSocketDebuggerUrl);
  const heldCodes = new Set();
  const timeline = [];
  let capturing = true;

  async function evaluate(expression) {
    return client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
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

  async function tap(code, milliseconds = 36) {
    await press(code);
    await pause(milliseconds);
    await release(code);
  }

  async function tapGamepadButton(index, milliseconds = 90) {
    await evaluate(`globalThis.__MECHSKY_TEST_GAMEPAD__.buttons[${index}] = true`);
    await pause(milliseconds);
    await evaluate(`globalThis.__MECHSKY_TEST_GAMEPAD__.buttons[${index}] = false`);
    await pause(milliseconds);
  }

  async function tapConfirm() {
    if (inputMode === "gamepad") {
      await tapGamepadButton(0);
    } else {
      await tap("Enter");
    }
  }

  async function tapPause() {
    if (inputMode === "gamepad") {
      await tapGamepadButton(9);
    } else {
      await tap("Escape");
    }
  }

  async function readState() {
    const result = await evaluate(`JSON.stringify((() => {
      const data = document.querySelector("#game-surface")?.dataset ?? {};
      return {
        tick: data.simTick,
        flow: data.flowPhase,
        outcome: data.battleOutcome,
        inputLocked: data.inputLocked,
        ai: data.enemyAi,
        playerHealth: data.playerHealth,
        playerState: data.playerState,
        playerAction: data.playerAttack,
        playerActionFrame: data.playerActionFrame,
        playerPhase: data.playerAttackPhase,
        playerLocomotion: data.playerLocomotion,
        playerElevation: data.playerElevation,
        playerX: data.playerX,
        playerY: data.playerY,
        enemyHealth: data.enemyHealth,
        enemyState: data.enemyState,
        enemyAction: data.enemyAttack,
        enemyLocomotion: data.enemyLocomotion,
        enemyElevation: data.enemyElevation,
        enemyX: data.enemyX,
        enemyY: data.enemyY,
        combo: data.comboHits,
        inputSource: document.querySelector("#input-source")?.textContent,
        flowPrompt: document.querySelector("#flow-prompt")?.textContent,
        guideAttack: document.querySelector("#control-attack")?.textContent,
        guidePause: document.querySelector("#control-pause")?.textContent,
      };
    })())`);
    const raw = JSON.parse(result.result?.value ?? "{}");
    return {
      ...raw,
      tick: Number(raw.tick),
      playerHealth: Number(raw.playerHealth),
      playerActionFrame: Number(raw.playerActionFrame),
      playerElevation: Number(raw.playerElevation),
      playerX: Number(raw.playerX),
      playerY: Number(raw.playerY),
      enemyHealth: Number(raw.enemyHealth),
      enemyElevation: Number(raw.enemyElevation),
      enemyX: Number(raw.enemyX),
      enemyY: Number(raw.enemyY),
      combo: Number(raw.combo),
    };
  }

  async function note(label, state = undefined) {
    timeline.push({ label, ...(state ?? (await readState())) });
  }

  async function waitFor(label, predicate, timeoutMilliseconds = 6_000) {
    const deadline = performance.now() + timeoutMilliseconds;
    while (performance.now() < deadline) {
      const state = await readState();
      if (predicate(state)) {
        await note(label, state);
        return state;
      }
      await pause(16);
    }
    throw new Error(`${label} was not reached: ${JSON.stringify(await readState())}`);
  }

  async function waitUntilReady() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
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

  async function captureFrames() {
    if (captureDirectory === undefined) {
      return;
    }
    await mkdir(captureDirectory, { recursive: true });
    const startedAt = performance.now();
    let index = 0;
    while (capturing && index < MAX_CAPTURE_FRAMES) {
      const deadline = startedAt + index * CAPTURE_INTERVAL_MILLISECONDS;
      await pause(Math.max(0, deadline - performance.now()));
      const result = await client.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "jpeg",
        fromSurface: true,
        optimizeForSpeed: true,
        quality: 86,
      });
      await writeFile(
        join(captureDirectory, `frame-${String(index).padStart(4, "0")}.jpg`),
        Buffer.from(result.data, "base64"),
      );
      index += 1;
    }
  }

  async function verifyPause() {
    await tapPause();
    const paused = await waitFor(
      "paused",
      (state) =>
        state.flow === "paused" &&
        (inputMode === "keyboard" || state.flowPrompt.includes("Menu 버튼")),
    );
    await screenshot(`${evidencePrefix}-paused.png`);
    await pause(450);
    const stillPaused = await readState();
    if (stillPaused.tick !== paused.tick) {
      throw new Error(`Simulation advanced while paused: ${paused.tick} -> ${stillPaused.tick}`);
    }
    await tapPause();
    await waitFor("resumed", (state) => state.flow === "active");
  }

  async function waitForActionable() {
    return waitFor(
      "player-actionable",
      (state) =>
        state.flow === "active" &&
        state.outcome === "ongoing" &&
        state.inputLocked === "false" &&
        state.playerLocomotion === "grounded" &&
        state.playerAction === "none" &&
        state.playerState !== "hitstun" &&
        state.playerState !== "downed",
      8_000,
    );
  }

  async function approachTarget(range) {
    for (let step = 0; step < 140; step += 1) {
      const state = await readState();
      if (state.playerState === "hitstun" || state.playerState === "downed") {
        await pause(100);
        continue;
      }
      const dx = state.enemyX - state.playerX;
      const dy = state.enemyY - state.playerY;
      const distance = Math.hypot(dx, dy);
      if (state.enemyAction !== "none" && distance <= 185) {
        const evadeCode =
          Math.abs(dx) >= Math.abs(dy)
            ? dx > 0
              ? "KeyA"
              : "KeyD"
            : dy > 0
              ? "KeyW"
              : "Numpad2";
        await press(evadeCode);
        await pause(35);
        await tap("ShiftLeft", 30);
        await release(evadeCode);
        await pause(70);
        continue;
      }
      if (distance <= range) {
        return state;
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
      await pause(42);
      await release(code);
    }
    throw new Error(`Could not approach enemy: ${JSON.stringify(await readState())}`);
  }

  async function landOpeningHit(label) {
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      await waitForActionable();
      const before = await approachTarget(102);
      await tap("KeyZ");
      try {
        return await waitFor(
          `${label}-ground-1`,
          (state) => state.enemyHealth === before.enemyHealth - 60,
          900,
        );
      } catch {
        await note(`${label}-opening-miss-${attempt}`);
      }
    }
    throw new Error(`Could not land ${label} opening hit.`);
  }

  async function executeFullCombo(label) {
    const opening = await landOpeningHit(label);
    const startHealth = opening.enemyHealth + 60;

    await waitFor(
      `${label}-ground-1-cancel`,
      (state) =>
        state.playerAction === "mech-ground-1" &&
        state.playerActionFrame >= 10,
    );
    await tap("KeyZ");
    await waitFor(
      `${label}-ground-2`,
      (state) => state.enemyHealth === startHealth - 150,
    );

    await waitFor(
      `${label}-ground-2-cancel`,
      (state) =>
        state.playerAction === "mech-ground-2" &&
        state.playerActionFrame >= 13,
    );
    await tap("KeyX");
    await waitFor(
      `${label}-launcher`,
      (state) => state.enemyHealth === startHealth - 225 && state.enemyElevation > 0,
    );

    await waitFor(
      `${label}-launcher-cancel`,
      (state) =>
        state.playerAction === "mech-launcher" &&
        state.playerActionFrame >= 11,
    );
    await tap("ShiftLeft");
    await waitFor(
      `${label}-homing`,
      (state) => state.playerState === "dashing" && state.playerLocomotion === "airborne",
    );
    await waitFor(
      `${label}-air-range`,
      (state) =>
        Math.hypot(state.enemyX - state.playerX, state.enemyY - state.playerY) < 105 &&
        Math.abs(state.enemyElevation - state.playerElevation) < 58,
    );

    await tap("KeyZ");
    await waitFor(
      `${label}-air-1`,
      (state) => state.enemyHealth === startHealth - 275,
    );
    await waitFor(
      `${label}-air-1-cancel`,
      (state) =>
        state.playerAction === "mech-air-1" && state.playerActionFrame >= 9,
    );
    await tap("KeyZ");
    await waitFor(
      `${label}-air-2`,
      (state) => state.enemyHealth === startHealth - 340,
    );
    await waitFor(
      `${label}-air-2-cancel`,
      (state) =>
        state.playerAction === "mech-air-2" && state.playerActionFrame >= 10,
    );
    await tap("KeyX");
    await waitFor(
      `${label}-finisher`,
      (state) => state.enemyHealth === Math.max(0, startHealth - 480),
    );
    return waitFor(
      `${label}-ground-impact`,
      (state) => state.enemyLocomotion === "downed",
      8_000,
    );
  }

  async function runVictory() {
    await verifyPause();
    await tap("Tab");
    await executeFullCombo("combo-1");
    await waitFor(
      "enemy-wake-1",
      (state) =>
        state.enemyLocomotion === "grounded" &&
        state.playerLocomotion === "grounded" &&
        state.enemyHealth === 420,
      8_000,
    );
    await executeFullCombo("combo-2");
    const victory = await waitFor(
      "victory-result",
      (state) => state.flow === "victory" && state.outcome === "victory",
      8_000,
    );
    await screenshot(`${evidencePrefix}-result.png`);
    return victory;
  }

  async function runDefeat() {
    await verifyPause();
    const defeated = await waitFor(
      "defeat-result",
      (state) => state.flow === "defeat" && state.outcome === "defeat",
      65_000,
    );
    await screenshot(`${evidencePrefix}-result.png`);
    return defeated;
  }

  async function verifyRetry(outcomeState) {
    await tapConfirm();
    const reset = await waitFor(
      "retry-reset",
      (state) =>
        state.flow === "active" &&
        state.outcome === "ongoing" &&
        state.playerHealth === 1_000 &&
        state.enemyHealth === 900 &&
        state.combo === 0 &&
        state.tick < outcomeState.tick,
      2_000,
    );
    await screenshot(`${evidencePrefix}-retry-reset.png`);
    return reset;
  }

  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    if (inputMode === "gamepad") {
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
          const state = { axes: [0, 0], buttons: Array(10).fill(false) };
          globalThis.__MECHSKY_TEST_GAMEPAD__ = state;
          Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => [{
              axes: [...state.axes],
              buttons: state.buttons.map((pressed) => ({
                pressed,
                touched: pressed,
                value: pressed ? 1 : 0,
              })),
              connected: true,
              id: "MechSky CDP Standard Gamepad",
              index: 0,
              mapping: "standard",
              timestamp: performance.now(),
            }],
          });
        })();`,
      });
    }
    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 800,
      mobile: false,
      screenHeight: 800,
      screenWidth: 1280,
      width: 1280,
    });
    await client.send("Page.reload", { ignoreCache: false });
    await waitUntilReady();
    await waitFor(
      "intro",
      (state) =>
        state.flow === "intro" &&
        (inputMode === "keyboard" ||
          (state.inputSource.includes("GAMEPAD") &&
            state.flowPrompt.includes("A 버튼") &&
            state.guideAttack.startsWith("A ") &&
            state.guidePause.startsWith("Menu "))),
    );
    await screenshot(`${evidencePrefix}-intro.png`);
    await tapConfirm();
    await waitFor(
      "battle-started",
      (state) =>
        state.flow === "active" &&
        (inputMode === "keyboard" || state.inputSource.includes("GAMEPAD")),
    );

    const capturePromise = captureFrames();
    const outcomeState = mode === "victory" ? await runVictory() : await runDefeat();
    await verifyRetry(outcomeState);
    capturing = false;
    await capturePromise;

    const output = JSON.stringify({ mode, inputMode, timeline }, null, 2);
    if (timelineFile !== undefined) {
      await writeFile(timelineFile, `${output}\n`);
    }
    process.stdout.write(`${output}\n`);
  } finally {
    capturing = false;
    for (const code of heldCodes) {
      await keyEvent("keyUp", code).catch(() => undefined);
    }
    client.close();
  }
}

await main();
