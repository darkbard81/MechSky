import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cdpBaseUrl = process.env.MECHSKY_CDP_URL ?? "http://127.0.0.1:9224";
const captureDirectory = process.env.MECHSKY_CAPTURE_DIR;
const proofDirectory = process.env.MECHSKY_PROOF_DIR;
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

  const listeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id === undefined) {
      const handler = listeners.get(message.method);
      if (handler !== undefined) {
        handler(message.params);
      }
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

  function on(method, handler) {
    listeners.set(method, handler);
  }

  return { send, on, close: () => socket.close() };
}

const KEY_DATA = {
  KeyD: { key: "d", windowsVirtualKeyCode: 68 },
  KeyW: { key: "w", windowsVirtualKeyCode: 87 },
  Numpad2: { key: "2", windowsVirtualKeyCode: 98, isKeypad: true },
  Numpad4: { key: "4", windowsVirtualKeyCode: 100, isKeypad: true },
  Numpad6: { key: "6", windowsVirtualKeyCode: 102, isKeypad: true },
  F2: { key: "F2", windowsVirtualKeyCode: 113 },
  KeyZ: { key: "z", windowsVirtualKeyCode: 90 },
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

  async function readCombat() {
    const result = await evaluate(
      'JSON.stringify({' +
        ' hp: document.querySelector("#game-surface")?.dataset.enemyHealth,' +
        ' combo: document.querySelector("#game-surface")?.dataset.comboHits,' +
        ' x: document.querySelector("#game-surface")?.dataset.playerX,' +
        ' y: document.querySelector("#game-surface")?.dataset.playerY,' +
        ' action: document.querySelector("#combat-action")?.textContent' +
      '})',
    );
    return JSON.parse(result.result?.value ?? "{}");
  }

  const timeline = [];

  async function note(label) {
    timeline.push({ label, ...(await readCombat()) });
  }

  async function readPositions() {
    const result = await evaluate(
      'JSON.stringify({' +
        ' px: document.querySelector("#game-surface")?.dataset.playerX,' +
        ' py: document.querySelector("#game-surface")?.dataset.playerY,' +
        ' ex: document.querySelector("#game-surface")?.dataset.enemyX,' +
        ' ey: document.querySelector("#game-surface")?.dataset.enemyY' +
      '})',
    );
    const raw = JSON.parse(result.result?.value ?? "{}");
    return {
      px: Number(raw.px),
      py: Number(raw.py),
      ex: Number(raw.ex),
      ey: Number(raw.ey),
    };
  }

  /** Steps toward the target one axis at a time until inside `range`. */
  async function approachTarget(range) {
    for (let step = 0; step < 40; step += 1) {
      const { px, py, ex, ey } = await readPositions();
      const dx = ex - px;
      const dy = ey - py;

      if (Math.hypot(dx, dy) <= range) {
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
      await pause(110);
      await release(code);
    }

    throw new Error("Could not close the distance to the target.");
  }

  async function runScenario() {
    await pause(500);
    await note("start");

    // 1. Whiff from spawn distance: the swing plays and connects with nothing.
    await tap("KeyZ");
    await pause(90);
    await note("whiff-during-swing");
    await pause(700);
    await note("whiff-done");

    // 2. Walk to the target instead of guessing a duration, then lock on.
    await approachTarget(95);
    await pause(250);
    await tap("Tab");
    await pause(200);
    await note("approached-and-locked");

    // 3. Single hit, then idle long enough for the combo counter to reset.
    await tap("KeyZ");
    await pause(140);
    await note("hit-1-mid-swing");
    await pause(1_500);
    await note("after-single-hit");

    // 4. Two-hit combo: follow-up inside the cancel window.
    await tap("KeyZ");
    await pause(210);
    await tap("KeyZ");
    await pause(250);
    await note("combo-second-swing");
    await pause(900);
    await note("after-two-hit-combo");

    // 5. A follow-up pressed after the cancel window closed cannot chain: the
    //    next swing restarts at hit one. (The too-early case needs frame-exact
    //    timing, so it is covered by the unit tests instead.)
    await tap("KeyZ");
    await pause(140);
    await note("late-first-swing");
    await pause(950);
    await tap("KeyZ");
    await pause(140);
    await note("late-second-swing");
    await pause(950);
    await note("after-late-press");

    // 6. Hitbox overlay on, one more combo so judgement can be compared.
    await tap("F2");
    await pause(200);
    await tap("KeyZ");
    await pause(210);
    await tap("KeyZ");
    await pause(300);
    await note("combo-with-hitbox-overlay");
    await pause(900);

    // 7. Freeze-frame the active hitbox against the real judgement.
    const proof = await captureActiveHitboxProof("swing");
    if (proof !== null) {
      timeline.push({ label: "active-hitbox-proof", action: `${proof.frames} frames` });
    }
    await pause(700);
    await note("end");
  }

  /**
   * The active window is four frames, so a fixed-rate capture misses it and a
   * poll-then-screenshot round trip lands in recovery. Stream frames at the
   * compositor's own rate instead and keep every one of them.
   */
  async function captureActiveHitboxProof(name) {
    if (proofDirectory === undefined) {
      return null;
    }

    await mkdir(proofDirectory, { recursive: true });
    const frames = [];

    client.on("Page.screencastFrame", (params) => {
      frames.push(params.data);
      void client.send("Page.screencastFrameAck", {
        sessionId: params.sessionId,
      });
    });

    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 92,
      everyNthFrame: 1,
    });

    await pause(120);
    await tap("KeyZ");
    await pause(900);
    await client.send("Page.stopScreencast");

    const written = [];
    for (const [index, data] of frames.entries()) {
      const file = join(proofDirectory, `${name}-${String(index).padStart(3, "0")}.jpg`);
      await writeFile(file, Buffer.from(data, "base64"));
      written.push(file);
    }

    return { frames: written.length };
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
    await client.send("Page.enable");
    await client.send("Page.reload", { ignoreCache: false });
    await pause(300);
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
      JSON.stringify(
        {
          captureFrames:
            captureDirectory === undefined ? 0 : CAPTURE_FRAME_COUNT,
          state: JSON.parse(result.result?.value ?? "null"),
          timeline,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const code of heldCodes) {
      await keyEvent("keyUp", code).catch(() => undefined);
    }
    client.close();
  }
}

await main();
