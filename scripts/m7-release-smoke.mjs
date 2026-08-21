import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const artifactDirectory = resolve(
  process.env.MECHSKY_M7_ARTIFACT_DIR ?? "test-results/m7-release",
);
const STEAM_DECK_VIEWPORT = { width: 1_280, height: 800 };
const DESKTOP_VIEWPORT = { width: 1_920, height: 1_080 };
const STATE_TIMEOUT_MILLISECONDS = 10_000;
const PERFORMANCE_SAMPLE_TICKS = 240;
const FRAME_RATE_TOLERANCE = 0.95;
const headedBrowser = process.env.MECHSKY_M7_HEADED === "1";

function requireAddress(server) {
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("M7 preview server did not expose a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve an Electron CDP port.");
  }
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error === undefined ? resolveClose() : reject(error)));
  });
  return address.port;
}

async function waitUntilReady(page) {
  try {
    await page.locator('#game-surface[data-ready="true"]').waitFor({
      state: "attached",
      timeout: 15_000,
    });
  } catch (error) {
    const diagnostics = await page
      .evaluate(() => ({
        ready: document.querySelector("#game-surface")?.getAttribute("data-ready"),
        loading: document.querySelector("#loading-detail")?.textContent,
        body: document.body.textContent?.slice(0, 500),
      }))
      .catch(() => ({ ready: "page-unavailable" }));
    throw new Error(
      `Game surface did not become ready: ${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  }
}

function captureErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

async function readState(page) {
  return page.evaluate(() => {
    const surface = document.querySelector("#game-surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("#game-surface is missing.");
    }
    const data = surface.dataset;
    return {
      tick: Number(data["simTick"]),
      flow: data["flowPhase"],
      pauseReason: data["pauseReason"],
      outcome: data["battleOutcome"],
      inputLocked: data["inputLocked"],
      playerHealth: Number(data["playerHealth"]),
      playerAction: data["playerAttack"],
      playerActionFrame: Number(data["playerActionFrame"]),
      playerState: data["playerState"],
      playerLocomotion: data["playerLocomotion"],
      playerElevation: Number(data["playerElevation"]),
      playerX: Number(data["playerX"]),
      playerY: Number(data["playerY"]),
      enemyHealth: Number(data["enemyHealth"]),
      enemyAction: data["enemyAttack"],
      enemyState: data["enemyState"],
      enemyLocomotion: data["enemyLocomotion"],
      enemyElevation: Number(data["enemyElevation"]),
      enemyX: Number(data["enemyX"]),
      enemyY: Number(data["enemyY"]),
      inputSource: document.querySelector("#input-source")?.textContent ?? "",
    };
  });
}

async function waitForState(
  page,
  label,
  predicate,
  timeoutMilliseconds = STATE_TIMEOUT_MILLISECONDS,
) {
  const deadline = performance.now() + timeoutMilliseconds;
  let state = await readState(page);

  while (performance.now() < deadline) {
    if (predicate(state)) {
      return state;
    }
    await page.waitForTimeout(16);
    state = await readState(page);
  }

  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function debugDump(page) {
  return page.evaluate(() => {
    const api = window.__GAME_DEBUG__;
    if (api === undefined) {
      throw new Error("window.__GAME_DEBUG__ is not installed.");
    }
    return api.dump();
  });
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Required layout element ${selector} is missing.`);
      }
      const rectangle = element.getBoundingClientRect();
      return {
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
        right: rectangle.right,
        bottom: rectangle.bottom,
        display: getComputedStyle(element).display,
      };
    };

    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      battle: bounds(".battle-panel"),
      architecture: bounds(".architecture-panel"),
      combatHud: bounds(".combat-hud"),
      flowCard: bounds(".flow-card"),
      flowPrompt: bounds(".flow-prompt"),
      simulationHud: bounds(".simulation-hud"),
      movementHud: bounds(".movement-hud"),
    };
  });
}

function rectanglesOverlap(first, second) {
  return !(
    first.right <= second.x ||
    second.right <= first.x ||
    first.bottom <= second.y ||
    second.bottom <= first.y
  );
}

function assertCandidateLayout(layout, expectedViewport) {
  assert.deepEqual(layout.viewport, expectedViewport);
  assert.ok(layout.scrollWidth <= expectedViewport.width);
  assert.ok(layout.battle.x >= 0 && layout.battle.right <= expectedViewport.width);
  assert.ok(
    layout.architecture.x >= 0 &&
      layout.architecture.right <= expectedViewport.width,
  );
  assert.equal(rectanglesOverlap(layout.battle, layout.architecture), false);
  assert.equal(rectanglesOverlap(layout.combatHud, layout.flowCard), false);
  assert.ok(layout.flowPrompt.x >= layout.flowCard.x);
  assert.ok(layout.flowPrompt.right <= layout.flowCard.right);
  assert.equal(layout.simulationHud.display, "none");
  assert.equal(layout.movementHud.display, "none");
}

async function tapKeyboard(page, action) {
  const key = {
    primary: "z",
    special: "x",
    dash: "Shift",
  }[action];
  if (key === undefined) {
    throw new RangeError(`Unknown keyboard action ${action}.`);
  }
  await page.keyboard.press(key);
  await page.waitForTimeout(34);
}

async function tapGamepad(page, action) {
  const button = {
    primary: 0,
    special: 2,
    dash: 1,
  }[action];
  if (button === undefined) {
    throw new RangeError(`Unknown gamepad action ${action}.`);
  }
  await page.evaluate((index) => {
    const state = globalThis.__MECHSKY_M7_GAMEPAD__;
    if (state === undefined) {
      throw new Error("M7 virtual gamepad is not installed.");
    }
    state.buttons[index] = true;
  }, button);
  await page.waitForTimeout(50);
  await page.evaluate((index) => {
    const state = globalThis.__MECHSKY_M7_GAMEPAD__;
    if (state === undefined) {
      throw new Error("M7 virtual gamepad is not installed.");
    }
    state.buttons[index] = false;
  }, button);
  await page.waitForTimeout(50);
}

async function executeCoreCombo(page, tapAction) {
  const initial = await waitForState(
    page,
    "an actionable grounded player",
    (state) =>
      state.flow === "active" &&
      state.playerLocomotion === "grounded" &&
      state.playerAction === "none" &&
      state.playerState !== "hitstun" &&
      state.playerState !== "downed",
  );
  const startHealth = initial.enemyHealth;

  await tapAction(page, "primary");
  await waitForState(
    page,
    "ground hit 1",
    (state) => state.enemyHealth === startHealth - 60,
  );
  return finishCoreCombo(page, tapAction, startHealth);
}

async function finishCoreCombo(page, tapAction, startHealth) {
  await waitForState(
    page,
    "ground hit 1 cancel",
    (state) =>
      state.playerAction === "mech-ground-1" && state.playerActionFrame >= 10,
  );
  await tapAction(page, "primary");
  await waitForState(
    page,
    "ground hit 2",
    (state) => state.enemyHealth === startHealth - 150,
  );
  await waitForState(
    page,
    "ground hit 2 cancel",
    (state) =>
      state.playerAction === "mech-ground-2" && state.playerActionFrame >= 13,
  );
  await tapAction(page, "special");
  await waitForState(
    page,
    "launcher",
    (state) =>
      state.enemyHealth === startHealth - 225 && state.enemyElevation > 0,
  );
  await waitForState(
    page,
    "launcher cancel",
    (state) =>
      state.playerAction === "mech-launcher" && state.playerActionFrame >= 11,
  );
  await tapAction(page, "dash");
  await waitForState(
    page,
    "airborne homing chase",
    (state) =>
      state.playerState === "dashing" && state.playerLocomotion === "airborne",
  );
  await tapAction(page, "primary");
  await waitForState(
    page,
    "air hit 1",
    (state) => state.enemyHealth === startHealth - 275,
  );
  await waitForState(
    page,
    "air hit 1 cancel",
    (state) =>
      state.playerAction === "mech-air-1" && state.playerActionFrame >= 9,
  );
  await tapAction(page, "primary");
  await waitForState(
    page,
    "air hit 2",
    (state) => state.enemyHealth === startHealth - 340,
  );
  await waitForState(
    page,
    "air hit 2 cancel",
    (state) =>
      state.playerAction === "mech-air-2" && state.playerActionFrame >= 10,
  );
  await tapAction(page, "special");
  await waitForState(
    page,
    "finisher",
    (state) => state.enemyHealth === Math.max(0, startHealth - 480),
  );
  return waitForState(
    page,
    "ground slam",
    (state) => state.enemyLocomotion === "downed",
  );
}

async function waitForActionablePlayer(page) {
  return waitForState(
    page,
    "an actionable standard-route player",
    (state) =>
      state.flow === "active" &&
      state.outcome === "ongoing" &&
      state.inputLocked === "false" &&
      state.playerLocomotion === "grounded" &&
      state.playerAction === "none" &&
      state.playerState !== "hitstun" &&
      state.playerState !== "downed",
    12_000,
  );
}

async function tapMovement(page, key, milliseconds = 42) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}

async function approachStandardTarget(page, range) {
  for (let step = 0; step < 160; step += 1) {
    const state = await readState(page);
    if (state.playerState === "hitstun" || state.playerState === "downed") {
      await page.waitForTimeout(80);
      continue;
    }

    const deltaX = state.enemyX - state.playerX;
    const deltaY = state.enemyY - state.playerY;
    const distance = Math.hypot(deltaX, deltaY);
    if (state.enemyAction !== "none" && distance <= 185) {
      const evadeKey =
        Math.abs(deltaX) >= Math.abs(deltaY)
          ? deltaX > 0
            ? "a"
            : "d"
          : deltaY > 0
            ? "w"
            : "s";
      await page.keyboard.down(evadeKey);
      await page.waitForTimeout(35);
      await tapKeyboard(page, "dash");
      await page.keyboard.up(evadeKey);
      await page.waitForTimeout(70);
      continue;
    }

    if (distance <= range) {
      return state;
    }

    const approachKey =
      Math.abs(deltaX) >= Math.abs(deltaY)
        ? deltaX > 0
          ? "d"
          : "a"
        : deltaY > 0
          ? "s"
          : "w";
    await tapMovement(page, approachKey);
  }

  throw new Error(
    `Could not approach the standard-route enemy: ${JSON.stringify(await readState(page))}`,
  );
}

async function landStandardOpening(page) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await waitForActionablePlayer(page);
    const before = await approachStandardTarget(page, 102);
    await tapKeyboard(page, "primary");
    try {
      await waitForState(
        page,
        `standard opening hit ${attempt}`,
        (state) => state.enemyHealth === before.enemyHealth - 60,
        1_200,
      );
      return before.enemyHealth;
    } catch {
      // AI spacing can make one startup whiff; retry from the next actionable frame.
    }
  }

  throw new Error("Could not land a standard-route opening hit after 12 attempts.");
}

async function executeStandardCoreCombo(page) {
  const startHealth = await landStandardOpening(page);
  return finishCoreCombo(page, tapKeyboard, startHealth);
}

async function installVirtualGamepad(context) {
  await context.addInitScript(() => {
    const state = { axes: [0, 0], buttons: Array(10).fill(false) };
    globalThis.__MECHSKY_M7_GAMEPAD__ = state;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          axes: [...state.axes],
          buttons: state.buttons.map((pressed) => ({
            pressed,
            touched: pressed,
            value: pressed ? 1 : 0,
          })),
          connected: true,
          id: "MechSky M7 Standard Gamepad",
          index: 0,
          mapping: "standard",
          timestamp: performance.now(),
        },
      ],
    });
  });
}

async function runBrowserCandidate(baseUrl, browser) {
  const errorGroups = [];
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: STEAM_DECK_VIEWPORT,
  });
  const page = await context.newPage();
  errorGroups.push(captureErrors(page));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitUntilReady(page);
  assert.equal(await page.locator("#platform-kind").textContent(), "Browser");
  assert.equal(await page.locator("#flow-overlay").getAttribute("data-phase"), "intro");
  assert.equal(await page.locator("#boot-overlay").isHidden(), true);
  const steamDeckLayout = await inspectLayout(page);
  assertCandidateLayout(steamDeckLayout, STEAM_DECK_VIEWPORT);
  await page.screenshot({
    path: resolve(artifactDirectory, "browser-1280x800-intro.png"),
  });

  await page.locator("#fullscreen-button").focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "fullscreen-button",
  );
  assert.notEqual(
    await page.locator("#fullscreen-button").evaluate((element) =>
      getComputedStyle(element).boxShadow,
    ),
    "none",
  );
  await page.locator("#fullscreen-button").click();
  await page.locator('#fullscreen-button[aria-pressed="true"]').waitFor();
  await page.locator("#fullscreen-button").click();
  await page.locator('#fullscreen-button[aria-pressed="false"]').waitFor();

  await page.keyboard.press("Enter");
  const active = await waitForState(
    page,
    "standard battle start",
    (state) => state.flow === "active" && state.tick >= 2,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const paused = await waitForState(
    page,
    "focus-loss pause",
    (state) => state.flow === "paused" && state.pauseReason === "focus-loss",
  );
  await page.waitForTimeout(250);
  assert.equal((await readState(page)).tick, paused.tick);
  await page.keyboard.press("Escape");
  const resumed = await waitForState(
    page,
    "focus-loss resume",
    (state) => state.flow === "active" && state.tick > paused.tick,
  );
  assert.ok(resumed.tick > active.tick);

  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitUntilReady(page);
  const desktopLayout = await inspectLayout(page);
  assertCandidateLayout(desktopLayout, DESKTOP_VIEWPORT);
  await page.screenshot({
    path: resolve(artifactDirectory, "browser-1920x1080-intro.png"),
  });
  await page.close();

  const performancePage = await context.newPage();
  errorGroups.push(captureErrors(performancePage));
  await performancePage.bringToFront();
  await performancePage.setViewportSize(STEAM_DECK_VIEWPORT);
  await performancePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitUntilReady(performancePage);
  await performancePage.keyboard.press("Enter");
  await waitForState(
    performancePage,
    "performance battle start",
    (state) => state.flow === "active" && state.tick >= 2,
  );
  await performancePage.waitForFunction(
    (minimumSamples) =>
      (window.__GAME_DEBUG__?.dump().performance.simulation.samples ?? 0) >=
      minimumSamples,
    PERFORMANCE_SAMPLE_TICKS,
    { timeout: 15_000 },
  );
  const performanceResult = (await debugDump(performancePage)).performance;
  assert.ok(
    performanceResult.simulation.averageMilliseconds <
      performanceResult.budgets.simulationAverageMilliseconds,
  );
  assert.ok(
    performanceResult.collisionHit.averageMilliseconds <
      performanceResult.budgets.collisionHitAverageMilliseconds,
  );
  assert.ok(
    performanceResult.ai.averageMilliseconds <
      performanceResult.budgets.aiAverageMilliseconds,
  );
  const browserFrameRateQualified =
    performanceResult.frame.framesPerSecond >=
    performanceResult.budgets.minimumFramesPerSecond * FRAME_RATE_TOLERANCE;
  if (headedBrowser) {
    assert.equal(browserFrameRateQualified, true);
    assert.ok(performanceResult.frame.spikeCount <= 2);
  }

  const replayProof = await performancePage.evaluate(() => {
    const api = window.__GAME_DEBUG__;
    if (api === undefined) {
      throw new Error("window.__GAME_DEBUG__ is not installed.");
    }
    api.load("air-combo");
    return api.step(91).stateHash;
  });
  assert.equal(replayProof, "a395bcca");
  await performancePage.close();

  const reducedContext = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    viewport: STEAM_DECK_VIEWPORT,
  });
  const reducedPage = await reducedContext.newPage();
  errorGroups.push(captureErrors(reducedPage));
  await reducedPage.bringToFront();
  await reducedPage.goto(`${baseUrl}/?devScenario=air-combo`, {
    waitUntil: "domcontentloaded",
  });
  await waitUntilReady(reducedPage);
  assert.equal((await debugDump(reducedPage)).reducedMotion, true);
  await reducedPage.screenshot({
    path: resolve(artifactDirectory, "browser-reduced-motion-1280x800.png"),
  });
  await reducedContext.close();

  const keyboardPage = await context.newPage();
  errorGroups.push(captureErrors(keyboardPage));
  await keyboardPage.bringToFront();
  await keyboardPage.setViewportSize(STEAM_DECK_VIEWPORT);
  const keyboardScenario = headedBrowser ? "standard" : "input-validation";
  const keyboardUrl =
    keyboardScenario === "standard"
      ? baseUrl
      : `${baseUrl}/?devScenario=input-validation`;
  await keyboardPage.goto(keyboardUrl, {
    waitUntil: "domcontentloaded",
  });
  await waitUntilReady(keyboardPage);
  if (keyboardScenario === "standard") {
    await keyboardPage.keyboard.press("Enter");
    await waitForState(
      keyboardPage,
      "standard keyboard battle start",
      (state) => state.flow === "active" && state.tick >= 1,
    );
    await keyboardPage.keyboard.press("Tab");
  }
  const matchStartMilliseconds = performance.now();
  if (keyboardScenario === "standard") {
    await executeStandardCoreCombo(keyboardPage);
  } else {
    await executeCoreCombo(keyboardPage, tapKeyboard);
  }
  await keyboardPage.screenshot({
    path: resolve(artifactDirectory, "keyboard-core-combo-1280x800.png"),
  });
  await waitForState(
    keyboardPage,
    "enemy recovery before second combo",
    (state) =>
      state.enemyHealth === 420 &&
      state.enemyLocomotion === "grounded" &&
      state.playerLocomotion === "grounded" &&
      state.playerAction === "none",
  );
  if (keyboardScenario === "standard") {
    await executeStandardCoreCombo(keyboardPage);
  } else {
    await executeCoreCombo(keyboardPage, tapKeyboard);
  }
  const victory = await waitForState(
    keyboardPage,
    "keyboard victory result",
    (state) => state.flow === "victory" && state.outcome === "victory",
  );
  const matchDurationMilliseconds = performance.now() - matchStartMilliseconds;
  assert.ok(matchDurationMilliseconds < 90_000);
  assert.equal(victory.enemyHealth, 0);
  await keyboardPage.screenshot({
    path: resolve(artifactDirectory, "keyboard-victory-1280x800.png"),
  });
  const resultLayout = await inspectLayout(keyboardPage);
  assert.equal(rectanglesOverlap(resultLayout.combatHud, resultLayout.flowCard), false);
  await keyboardPage.keyboard.press("Enter");
  await waitForState(
    keyboardPage,
    "one-input retry",
    (state) =>
      state.flow === "active" &&
      state.outcome === "ongoing" &&
      state.playerHealth === 1_000 &&
      state.enemyHealth === 900,
  );
  await keyboardPage.close();

  const gamepadContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: STEAM_DECK_VIEWPORT,
  });
  await installVirtualGamepad(gamepadContext);
  const gamepadPage = await gamepadContext.newPage();
  errorGroups.push(captureErrors(gamepadPage));
  await gamepadPage.bringToFront();
  await gamepadPage.goto(`${baseUrl}/?devScenario=input-validation`, {
    waitUntil: "domcontentloaded",
  });
  await waitUntilReady(gamepadPage);
  await waitForState(
    gamepadPage,
    "gamepad input source",
    (state) => state.inputSource.includes("GAMEPAD"),
  );
  const gamepadCombo = await executeCoreCombo(gamepadPage, tapGamepad);
  assert.equal(gamepadCombo.enemyHealth, 420);
  await gamepadPage.screenshot({
    path: resolve(artifactDirectory, "gamepad-core-combo-1280x800.png"),
  });

  assert.deepEqual(errorGroups.flat(), []);
  await gamepadContext.close();
  await context.close();
  return {
    steamDeckLayout,
    desktopLayout,
    focusLoss: { pausedTick: paused.tick, resumedTick: resumed.tick },
    performance: performanceResult,
    browserFrameRateQualified,
    keyboardMatch: {
      scenario: keyboardScenario,
      durationMilliseconds: matchDurationMilliseconds,
      finalTick: victory.tick,
    },
    gamepadCombo: {
      enemyHealth: gamepadCombo.enemyHealth,
      tick: gamepadCombo.tick,
    },
    replayStateHash: replayProof,
  };
}

function electronEnvironment() {
  const environment = { ...process.env };
  const runtimeBus = `/run/user/${process.getuid?.() ?? 1_000}/bus`;
  if (existsSync(runtimeBus)) {
    environment.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeBus}`;
  }
  return environment;
}

async function waitForElectronCdp(port, processOutput) {
  const deadline = performance.now() + 15_000;
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return;
      }
    } catch {
      // Electron has not opened its DevTools endpoint yet.
    }
    await delay(100);
  }
  throw new Error(`Electron CDP endpoint did not open.\n${processOutput()}`);
}

async function runElectronCandidate(browserStateHash) {
  const port = await reservePort();
  const electronPath = resolve("node_modules/electron/dist/electron");
  const electron = spawn(
    electronPath,
    [`--remote-debugging-port=${port}`, "."],
    {
      cwd: process.cwd(),
      env: electronEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const appendOutput = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-16_000);
  };
  electron.stdout?.on("data", appendOutput);
  electron.stderr?.on("data", appendOutput);
  let browser;
  let page;

  try {
    await waitForElectronCdp(port, () => output);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const deadline = performance.now() + 10_000;
    while (page === undefined && performance.now() < deadline) {
      page = browser.contexts().flatMap((context) => context.pages())[0];
      if (page === undefined) {
        await delay(50);
      }
    }
    if (page === undefined) {
      throw new Error(`Electron did not create a renderer page.\n${output}`);
    }

    const errors = captureErrors(page);
    await waitUntilReady(page);
    assert.equal(new URL(page.url()).protocol, "file:");
    assert.equal(await page.locator("#platform-kind").textContent(), "Electron");
    const initialViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    await page.keyboard.press("Enter");
    await waitForState(
      page,
      "Electron performance battle start",
      (state) => state.flow === "active" && state.tick >= 2,
    );
    await page.waitForFunction(
      (minimumSamples) =>
        (window.__GAME_DEBUG__?.dump().performance.simulation.samples ?? 0) >=
        minimumSamples,
      PERFORMANCE_SAMPLE_TICKS,
      { timeout: 15_000 },
    );
    const performanceResult = (await debugDump(page)).performance;
    assert.ok(
      performanceResult.simulation.averageMilliseconds <
        performanceResult.budgets.simulationAverageMilliseconds,
    );
    assert.ok(
      performanceResult.collisionHit.averageMilliseconds <
        performanceResult.budgets.collisionHitAverageMilliseconds,
    );
    assert.ok(
      performanceResult.ai.averageMilliseconds <
        performanceResult.budgets.aiAverageMilliseconds,
    );
    assert.ok(
      performanceResult.frame.framesPerSecond >=
        performanceResult.budgets.minimumFramesPerSecond * FRAME_RATE_TOLERANCE,
      `Electron FPS ${performanceResult.frame.framesPerSecond.toFixed(2)} was below the 60 FPS target tolerance.`,
    );
    assert.ok(performanceResult.frame.spikeCount <= 2);
    const stateHash = await page.evaluate(() => {
      const api = window.__GAME_DEBUG__;
      if (api === undefined) {
        throw new Error("window.__GAME_DEBUG__ is not installed.");
      }
      api.load("air-combo");
      return api.step(91).stateHash;
    });
    assert.equal(stateHash, browserStateHash);
    await page.screenshot({
      path: resolve(artifactDirectory, "electron-production.png"),
    });

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await waitForState(
      page,
      "Electron focus-loss pause",
      (state) => state.flow === "paused" && state.pauseReason === "focus-loss",
    );
    await page.locator("#fullscreen-button").click();
    await page.locator('#fullscreen-button[aria-pressed="true"]').waitFor();
    await page.locator("#fullscreen-button").click();
    await page.locator('#fullscreen-button[aria-pressed="false"]').waitFor();
    await page.waitForTimeout(250);
    const restoredViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    assert.deepEqual(restoredViewport, initialViewport);
    assert.deepEqual(errors, []);

    return {
      url: page.url(),
      platform: "Electron",
      initialViewport,
      restoredViewport,
      replayStateHash: stateHash,
      performance: performanceResult,
    };
  } finally {
    await browser?.close().catch(() => undefined);
    if (electron.exitCode === null) {
      electron.kill("SIGTERM");
      await Promise.race([
        new Promise((resolveExit) => electron.once("exit", resolveExit)),
        delay(3_000),
      ]);
    }
    if (electron.exitCode === null) {
      electron.kill("SIGKILL");
    }
  }
}

async function main() {
  await mkdir(artifactDirectory, { recursive: true });
  const server = await preview({
    configFile: resolve("vite.config.ts"),
    logLevel: "error",
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  const browser = await chromium.launch({
    headless: !headedBrowser,
    executablePath: process.env.MECHSKY_CHROMIUM_PATH,
  });
  let browserResult;

  try {
    browserResult = await runBrowserCandidate(requireAddress(server), browser);
  } finally {
    await browser.close();
    await server.close();
  }

  const electronResult = await runElectronCandidate(browserResult.replayStateHash);
  const result = {
    build: "production",
    browserMode: headedBrowser ? "headed" : "headless",
    browser: browserResult,
    electron: electronResult,
    screenshots: [
      "browser-1280x800-intro.png",
      "browser-1920x1080-intro.png",
      "browser-reduced-motion-1280x800.png",
      "keyboard-core-combo-1280x800.png",
      "keyboard-victory-1280x800.png",
      "gamepad-core-combo-1280x800.png",
      "electron-production.png",
    ],
  };
  await writeFile(
    resolve(artifactDirectory, "release-smoke.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main();
