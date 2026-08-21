import { describe, expect, it } from "vitest";
import { GameFlow } from "../../src/app/game-flow";

const NONE = { confirm: false, pause: false } as const;

describe("GameFlow", () => {
  it("starts, pauses, and resumes without advancing terminal state", () => {
    const flow = new GameFlow();
    expect(flow.phase).toBe("intro");

    expect(flow.handleInput({ confirm: true, pause: false }).battleStarted).toBe(true);
    expect(flow.phase).toBe("active");
    flow.handleInput({ confirm: false, pause: true });
    expect(flow.phase).toBe("paused");
    flow.observeOutcome("victory");
    expect(flow.phase).toBe("paused");
    flow.handleInput({ confirm: false, pause: true });
    expect(flow.phase).toBe("active");
  });

  it.each(["victory", "defeat"] as const)(
    "locks into %s and requests retry from one confirm input",
    (outcome) => {
      const flow = new GameFlow();
      flow.handleInput({ confirm: true, pause: false });
      flow.observeOutcome(outcome);

      expect(flow.phase).toBe(outcome);
      expect(flow.handleInput(NONE).retryRequested).toBe(false);
      expect(flow.handleInput({ confirm: true, pause: false }).retryRequested).toBe(true);
      flow.restartBattle();
      expect(flow.phase).toBe("active");
    },
  );

  it("switches every prompt to gamepad controls without mouse input", () => {
    const flow = new GameFlow();
    expect(flow.presentation("gamepad").prompt).toContain("A 버튼");
    flow.handleInput({ confirm: true, pause: false });
    flow.handleInput({ confirm: false, pause: true });
    expect(flow.presentation("gamepad").prompt).toContain("Menu 버튼");
  });

  it("uses Z as the keyboard confirm shortcut", () => {
    const flow = new GameFlow();
    expect(flow.presentation("keyboard").prompt).toContain("Enter / Z");
    expect(flow.presentation("keyboard").prompt).not.toContain("J");
  });

  it("pauses active combat on focus loss and requires an explicit resume input", () => {
    const flow = new GameFlow();
    flow.handleInput({ confirm: true, pause: false });

    expect(flow.pauseForFocusLoss()).toBe(true);
    expect(flow.phase).toBe("paused");
    expect(flow.pauseReason).toBe("focus-loss");
    expect(flow.presentation("keyboard").kicker).toContain("FOCUS LOST");
    expect(flow.pauseForFocusLoss()).toBe(false);

    flow.handleInput({ confirm: false, pause: true });
    expect(flow.phase).toBe("active");
    expect(flow.pauseReason).toBeNull();
  });
});
