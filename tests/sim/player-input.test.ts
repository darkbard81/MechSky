import { describe, expect, it } from "vitest";
import {
  applyGamepadDeadzone,
  attackSlotForCode,
  keyboardMoveVector,
  PlayerInputController,
  resolveKeyboardCode,
} from "../../src/input/player-input";

describe("player input mapping", () => {
  it("maps J and K to primary and launcher or finisher slots", () => {
    expect(attackSlotForCode("KeyJ")).toBe(0);
    expect(attackSlotForCode("KeyK")).toBe(1);
    expect(attackSlotForCode("KeyL")).toBeNull();
  });

  it("emits gamepad X as slot 1 on the rising edge", () => {
    const eventWindow = new EventTarget() as Window;
    const eventDocument = new EventTarget() as Document;
    let pressed = true;
    const gamepad = {
      axes: [0, 0],
      buttons: Array.from({ length: 5 }, (_, index) => ({
        pressed: index === 2 && pressed,
      })),
      connected: true,
    } as unknown as Gamepad;
    const controller = new PlayerInputController(
      1,
      eventWindow,
      eventDocument,
      () => [
        {
          ...gamepad,
          buttons: Array.from({ length: 5 }, (_, index) => ({
            pressed: index === 2 && pressed,
          })) as unknown as readonly GamepadButton[],
        },
      ],
    );

    expect(controller.sampleIntents()).toContainEqual({
      type: "attack",
      fighterId: 1,
      slot: 1,
    });
    expect(controller.sampleIntents()).not.toContainEqual(
      expect.objectContaining({ type: "attack" }),
    );
    pressed = false;
    controller.sampleIntents();
    pressed = true;
    expect(controller.sampleIntents()).toContainEqual(
      expect.objectContaining({ type: "attack", slot: 1 }),
    );
    controller.destroy();
  });
  it.each([
    ["KeyW", "ArrowUp", "Numpad8", { x: 0, y: -1 }],
    ["KeyS", "ArrowDown", "Numpad2", { x: 0, y: 1 }],
    ["KeyA", "ArrowLeft", "Numpad4", { x: -1, y: 0 }],
    ["KeyD", "ArrowRight", "Numpad6", { x: 1, y: 0 }],
  ])("maps %s, %s, and %s to the same direction", (wasd, arrow, numpad, expected) => {
    expect(keyboardMoveVector([wasd])).toEqual(expected);
    expect(keyboardMoveVector([arrow])).toEqual(expected);
    expect(keyboardMoveVector([numpad])).toEqual(expected);
  });

  it.each([
    ["Numpad7", { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }],
    ["Numpad9", { x: Math.SQRT1_2, y: -Math.SQRT1_2 }],
    ["Numpad1", { x: -Math.SQRT1_2, y: Math.SQRT1_2 }],
    ["Numpad3", { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
  ])("maps %s to a normalized diagonal", (code, expected) => {
    expect(keyboardMoveVector([code]).x).toBeCloseTo(expected.x);
    expect(keyboardMoveVector([code]).y).toBeCloseTo(expected.y);
  });

  it("normalizes WASD diagonal input to the same vector as Numpad9", () => {
    expect(keyboardMoveVector(["KeyW", "KeyD"])).toEqual(
      keyboardMoveVector(["Numpad9"]),
    );
  });

  it("does not weight an axis twice when aliases are held together", () => {
    expect(keyboardMoveVector(["KeyW", "ArrowUp", "KeyD"])).toEqual(
      keyboardMoveVector(["Numpad9"]),
    );
  });

  it("uses numpad navigation-key fallback when code is unavailable", () => {
    expect(resolveKeyboardCode({ code: "", key: "Home", location: 3 })).toBe(
      "Numpad7",
    );
  });

  it("preserves analog magnitude after applying a radial deadzone", () => {
    expect(applyGamepadDeadzone(0.1, 0)).toEqual({ x: 0, y: 0 });
    expect(applyGamepadDeadzone(1, 0)).toEqual(
      keyboardMoveVector(["KeyD"]),
    );
    const diagonal = applyGamepadDeadzone(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });
});
