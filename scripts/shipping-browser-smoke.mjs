import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const artifactDirectory = resolve("test-results/shipping-browser");
const viewport = { width: 1_280, height: 800 };

function requireAddress(server) {
  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Shipping preview did not expose a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => {
    server.httpServer.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        reject(error);
      }
    });
  });
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
  let browser;
  let page;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.MECHSKY_CHROMIUM_PATH,
    });
    page = await browser.newPage({ deviceScaleFactor: 1, viewport });
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`pageerror: ${error.message}`);
    });

    await page.goto(requireAddress(server), { waitUntil: "domcontentloaded" });
    await page.locator('#game-surface[data-ready="true"]').waitFor({
      state: "attached",
      timeout: 15_000,
    });
    const summary = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("#game-surface canvas").length,
      debugApiInstalled: window.__GAME_DEBUG__ !== undefined,
      scenario: document.querySelector("#game-surface")?.getAttribute("data-scenario"),
    }));
    await page.screenshot({
      path: resolve(artifactDirectory, "shipping-1280x800.png"),
    });

    assert.equal(summary.canvasCount, 1);
    assert.equal(summary.debugApiInstalled, false);
    assert.equal(summary.scenario, "standard");
    assert.deepEqual(browserErrors, []);
    process.stdout.write(`${JSON.stringify({ viewport, ...summary })}\n`);
  } catch (error) {
    await page
      ?.screenshot({
        path: resolve(artifactDirectory, "failure-1280x800.png"),
      })
      .catch(() => undefined);
    throw error;
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await closeServer(server);
  }
}

await main();
