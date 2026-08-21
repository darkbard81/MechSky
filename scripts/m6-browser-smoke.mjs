import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const artifactDirectory = resolve(
  process.env.MECHSKY_BROWSER_ARTIFACT_DIR ?? "test-results/m6-browser",
);
const viewport = { width: 1_280, height: 800 };

function requireAddress(server) {
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("Vite browser gate did not expose a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function waitUntilReady(page) {
  await page.locator('#game-surface[data-ready="true"]').waitFor({
    state: "attached",
    timeout: 15_000,
  });
}

async function debugSummary(page) {
  return page.evaluate(() => {
    const api = window.__GAME_DEBUG__;
    if (api === undefined) {
      throw new Error("window.__GAME_DEBUG__ is not installed.");
    }
    const dump = api.dump();
    return {
      scenario: dump.scenario,
      mode: dump.mode,
      replayFrame: dump.replayFrame,
      replayLength: dump.replayLength,
      stateHash: dump.stateHash,
      tick: dump.snapshot.tick,
      playerAttack: dump.snapshot.player.attackId,
      playerElevation: dump.snapshot.player.body.position.elevation,
      enemyHealth: dump.snapshot.enemy.health,
      enemyElevation: dump.snapshot.enemy.body.position.elevation,
      enabledDebugLayers: [...dump.enabledDebugLayers],
      projectileCount: dump.projectileCount,
    };
  });
}

async function hudLayout(page) {
  return page.evaluate(() => {
    const selectors = [
      ".combat-hud",
      ".simulation-hud",
      ".movement-hud",
      ".control-guide",
    ];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Required HUD element ${selector} is missing.`);
      }
      const bounds = element.getBoundingClientRect();
      return {
        selector,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    });
  });
}

async function inspectBootFailure(browser, baseUrl) {
  const bootPage = await browser.newPage({
    deviceScaleFactor: 1,
    viewport,
  });
  const consoleErrors = [];
  const pageErrors = [];
  bootPage.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  bootPage.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    await bootPage.goto(`${baseUrl}/dev/battle?scenario=unknown`, {
      waitUntil: "domcontentloaded",
    });
    await bootPage.locator('#game-surface[data-ready="error"]').waitFor({
      state: "attached",
      timeout: 15_000,
    });
    const summary = await bootPage.evaluate(() => ({
      bootStatus: document.querySelector("#boot-status")?.textContent ?? "",
      detail: document.querySelector("#loading-detail")?.textContent ?? "",
      overlayHidden:
        document.querySelector("#boot-overlay")?.hasAttribute("hidden") ?? true,
    }));
    await bootPage.screenshot({
      path: resolve(artifactDirectory, "invalid-scenario-error-1280x800.png"),
    });

    assert.equal(summary.bootStatus, "초기화 실패");
    assert.match(summary.detail, /Unknown battle scenario 'unknown'/u);
    assert.equal(summary.overlayHidden, false);
    assert.deepEqual(pageErrors, []);
    assert.equal(consoleErrors.length, 1);
    assert.match(consoleErrors[0] ?? "", /Unknown battle scenario 'unknown'/u);
    return summary;
  } finally {
    await bootPage.close();
  }
}

async function main() {
  await mkdir(artifactDirectory, { recursive: true });
  const vite = await createServer({
    configFile: resolve("vite.config.ts"),
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  let browser;
  let page;

  try {
    await vite.listen();
    const baseUrl = requireAddress(vite);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.MECHSKY_CHROMIUM_PATH,
    });
    page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport,
    });
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`pageerror: ${error.message}`);
    });

    await page.goto(`${baseUrl}/dev/battle?scenario=vertical-slice`, {
      waitUntil: "domcontentloaded",
    });
    await waitUntilReady(page);
    await page.waitForFunction(
      () => Number(document.querySelector("#game-surface")?.dataset["simTick"]) >= 3,
    );
    const verticalSlice = await debugSummary(page);
    assert.equal(verticalSlice.scenario, "vertical-slice");
    assert.equal(verticalSlice.mode, "live");
    assert.equal(
      await page.locator("#game-surface").getAttribute("data-flow-phase"),
      "active",
    );

    await page.goto(`${baseUrl}/dev/battle?scenario=air-combo`, {
      waitUntil: "domcontentloaded",
    });
    await waitUntilReady(page);
    await page.waitForFunction(
      () => Number(document.querySelector("#game-surface")?.dataset["simTick"]) >= 3,
    );
    const directAirCombo = await debugSummary(page);
    assert.equal(directAirCombo.scenario, "air-combo");
    assert.equal(directAirCombo.mode, "replay-auto");
    assert.equal(
      await page.locator("#game-surface").getAttribute("data-flow-phase"),
      "active",
    );

    const first = await page.evaluate((tick) => {
      const api = window.__GAME_DEBUG__;
      if (api === undefined) {
        throw new Error("window.__GAME_DEBUG__ is not installed.");
      }
      api.load("air-combo");
      api.step(tick);
      const dump = api.dump();
      return {
        tick: dump.snapshot.tick,
        frame: dump.replayFrame,
        hash: dump.stateHash,
        enemyHealth: dump.snapshot.enemy.health,
        enemyElevation: dump.snapshot.enemy.body.position.elevation,
      };
    }, 91);
    const firstVisual = await page.screenshot();
    const second = await page.evaluate((tick) => {
      const api = window.__GAME_DEBUG__;
      if (api === undefined) {
        throw new Error("window.__GAME_DEBUG__ is not installed.");
      }
      const replay = api.dump().replay;
      api.load(replay);
      api.step(tick);
      const dump = api.dump();
      return {
        tick: dump.snapshot.tick,
        frame: dump.replayFrame,
        hash: dump.stateHash,
        enemyHealth: dump.snapshot.enemy.health,
        enemyElevation: dump.snapshot.enemy.body.position.elevation,
      };
    }, 91);
    const secondVisual = await page.screenshot();
    if (!firstVisual.equals(secondVisual)) {
      await writeFile(
        resolve(artifactDirectory, "visual-replay-expected-1280x800.png"),
        firstVisual,
      );
      await writeFile(
        resolve(artifactDirectory, "visual-replay-actual-1280x800.png"),
        secondVisual,
      );
      assert.fail("The fixed replay produced different 1280x800 screenshots.");
    }
    await writeFile(
      resolve(artifactDirectory, "visual-replay-1280x800.png"),
      secondVisual,
    );
    assert.deepEqual(second, first);
    assert.equal(first.tick, 91);
    assert.equal(first.frame, 91);
    assert.equal(first.hash, "a395bcca");
    assert.ok(first.enemyHealth < 900);
    assert.ok(first.enemyElevation > 0);

    const beforeToggle = await hudLayout(page);
    const enabledLayers = await page.evaluate(() => {
      const api = window.__GAME_DEBUG__;
      if (api === undefined) {
        throw new Error("window.__GAME_DEBUG__ is not installed.");
      }
      api.toggle("collision");
      api.toggle("hitbox");
      api.toggle("combat");
      api.toggle("performance");
      return [...api.dump().enabledDebugLayers];
    });
    assert.deepEqual(enabledLayers, [
      "collision",
      "hitbox",
      "combat",
      "performance",
    ]);
    await page.waitForTimeout(100);
    assert.deepEqual(await hudLayout(page), beforeToggle);
    await page.screenshot({
      path: resolve(artifactDirectory, "debug-overlays-1280x800.png"),
    });
    await page.evaluate(() => {
      const api = window.__GAME_DEBUG__;
      if (api === undefined) {
        throw new Error("window.__GAME_DEBUG__ is not installed.");
      }
      api.toggle("performance");
    });
    await page.waitForTimeout(50);

    const fixedScreenshot = resolve(
      artifactDirectory,
      "air-combo-fixed-1280x800.png",
    );
    await page.screenshot({ path: fixedScreenshot });
    const fixedSummary = await debugSummary(page);
    assert.equal(fixedSummary.tick, 91);
    assert.equal(fixedSummary.stateHash, first.hash);

    await page.goto(`${baseUrl}/dev/battle?scenario=1000-projectiles`, {
      waitUntil: "domcontentloaded",
    });
    await waitUntilReady(page);
    await page.waitForFunction(
      () =>
        document.querySelector("#game-surface")?.dataset["projectileCount"] ===
        "1000",
    );
    const projectileStress = await debugSummary(page);
    assert.equal(projectileStress.scenario, "1000-projectiles");
    assert.equal(projectileStress.projectileCount, 1_000);
    await page.screenshot({
      path: resolve(artifactDirectory, "1000-projectiles-1280x800.png"),
    });

    const bootFailure = await inspectBootFailure(browser, baseUrl);
    assert.deepEqual(browserErrors, []);
    const result = {
      viewport,
      verticalSlice,
      directAirCombo,
      fixedReplay: fixedSummary,
      repeatedHash: second.hash,
      projectileStress,
      bootFailure,
      screenshots: [
        "visual-replay-1280x800.png",
        "air-combo-fixed-1280x800.png",
        "debug-overlays-1280x800.png",
        "1000-projectiles-1280x800.png",
        "invalid-scenario-error-1280x800.png",
      ],
    };
    await writeFile(
      resolve(artifactDirectory, "browser-smoke.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (page !== undefined) {
      await page
        .screenshot({
          path: resolve(artifactDirectory, "failure-1280x800.png"),
        })
        .catch(() => undefined);
      await debugSummary(page)
        .then((summary) =>
          writeFile(
            resolve(artifactDirectory, "failure-state.json"),
            `${JSON.stringify(summary, null, 2)}\n`,
          ),
        )
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await vite.close();
  }
}

await main();
