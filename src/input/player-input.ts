import type { CommandIntent } from "../sim/input/command-intent";
import {
  clampVectorMagnitude,
  vectorLength,
  ZERO_VECTOR,
  type Vector2,
} from "../sim/math/vector2";
import type { EntityId } from "../sim/world/entity";

const GAMEPAD_DEADZONE = 0.18;
const NUMPAD_LOCATION = 3;

const DIRECTION_BY_CODE: Readonly<Record<string, Readonly<Vector2>>> = Object.freeze({
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  Numpad8: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  Numpad2: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  Numpad4: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  Numpad6: { x: 1, y: 0 },
  Numpad7: { x: -1, y: -1 },
  Numpad9: { x: 1, y: -1 },
  Numpad1: { x: -1, y: 1 },
  Numpad3: { x: 1, y: 1 },
});

const NUMPAD_FALLBACK_BY_KEY: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: "Numpad8",
  ArrowDown: "Numpad2",
  ArrowLeft: "Numpad4",
  ArrowRight: "Numpad6",
  Home: "Numpad7",
  PageUp: "Numpad9",
  End: "Numpad1",
  PageDown: "Numpad3",
});

const DASH_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const ATTACK_CODES = new Set(["KeyJ"]);
const LOCK_CODE = "Tab";
const MELEE_SLOT = 0;

export type InputSource = "keyboard" | "gamepad";
export type InputControl = "WASD" | "ARROWS" | "NUMPAD" | "KEYBOARD" | "LEFT STICK";

export interface InputStatus {
  readonly source: InputSource;
  readonly control: InputControl;
}

export function resolveKeyboardCode(event: Pick<KeyboardEvent, "code" | "key" | "location">): string {
  if (
    event.code in DIRECTION_BY_CODE ||
    DASH_CODES.has(event.code) ||
    ATTACK_CODES.has(event.code) ||
    event.code === LOCK_CODE
  ) {
    return event.code;
  }

  if (event.location === NUMPAD_LOCATION) {
    return NUMPAD_FALLBACK_BY_KEY[event.key] ?? event.code;
  }

  return event.code;
}

export function keyboardMoveVector(codes: Iterable<string>): Vector2 {
  let up = false;
  let down = false;
  let left = false;
  let right = false;

  for (const code of codes) {
    const direction = DIRECTION_BY_CODE[code];
    if (direction !== undefined) {
      left ||= direction.x < 0;
      right ||= direction.x > 0;
      up ||= direction.y < 0;
      down ||= direction.y > 0;
    }
  }

  return clampVectorMagnitude({
    x: Number(right) - Number(left),
    y: Number(down) - Number(up),
  });
}

export function applyGamepadDeadzone(
  x: number,
  y: number,
  deadzone = GAMEPAD_DEADZONE,
): Vector2 {
  const magnitude = Math.hypot(x, y);

  if (magnitude <= deadzone) {
    return { ...ZERO_VECTOR };
  }

  const boundedMagnitude = Math.min(magnitude, 1);
  const scaledMagnitude = (boundedMagnitude - deadzone) / (1 - deadzone);
  return {
    x: (x / magnitude) * scaledMagnitude,
    y: (y / magnitude) * scaledMagnitude,
  };
}

function controlForCode(code: string): InputControl {
  if (code.startsWith("Numpad")) {
    return "NUMPAD";
  }

  if (code.startsWith("Arrow")) {
    return "ARROWS";
  }

  if (code.startsWith("Key")) {
    return "WASD";
  }

  return "KEYBOARD";
}

function buttonPressed(gamepad: Gamepad, index: number): boolean {
  return gamepad.buttons[index]?.pressed ?? false;
}

export class PlayerInputController {
  private readonly pressedCodes = new Set<string>();
  private attackQueued = false;
  private dashQueued = false;
  private lockQueued = false;
  private previousAttackButton = false;
  private previousDashButton = false;
  private previousLockButton = false;
  private status: InputStatus = { source: "keyboard", control: "WASD" };

  constructor(
    private readonly fighterId: EntityId,
    private readonly eventWindow: Window = window,
    private readonly eventDocument: Document = document,
    private readonly readGamepads: () => readonly (Gamepad | null)[] = () =>
      navigator.getGamepads(),
  ) {
    eventWindow.addEventListener("keydown", this.handleKeyDown);
    eventWindow.addEventListener("keyup", this.handleKeyUp);
    eventWindow.addEventListener("blur", this.clearHeldInput);
    eventDocument.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  sampleIntents(): readonly CommandIntent[] {
    const keyboardMove = keyboardMoveVector(this.pressedCodes);
    const gamepadMove = this.pollGamepad();
    const move =
      vectorLength(gamepadMove) > vectorLength(keyboardMove)
        ? gamepadMove
        : keyboardMove;
    const intents: CommandIntent[] = [
      { type: "move", fighterId: this.fighterId, direction: move },
    ];

    if (this.attackQueued) {
      intents.push({ type: "attack", fighterId: this.fighterId, slot: MELEE_SLOT });
      this.attackQueued = false;
    }

    if (this.dashQueued) {
      intents.push({ type: "dash", fighterId: this.fighterId });
      this.dashQueued = false;
    }

    if (this.lockQueued) {
      intents.push({ type: "lock-target", fighterId: this.fighterId });
      this.lockQueued = false;
    }

    return intents;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  destroy(): void {
    this.eventWindow.removeEventListener("keydown", this.handleKeyDown);
    this.eventWindow.removeEventListener("keyup", this.handleKeyUp);
    this.eventWindow.removeEventListener("blur", this.clearHeldInput);
    this.eventDocument.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.clearHeldInput();
  }

  private pollGamepad(): Vector2 {
    const gamepad = this.readGamepads().find((candidate) => candidate?.connected);

    if (gamepad === undefined || gamepad === null) {
      this.previousAttackButton = false;
      this.previousDashButton = false;
      this.previousLockButton = false;
      return { ...ZERO_VECTOR };
    }

    const move = applyGamepadDeadzone(
      gamepad.axes[0] ?? 0,
      gamepad.axes[1] ?? 0,
    );
    const attackButton = buttonPressed(gamepad, 0);
    const dashButton = buttonPressed(gamepad, 1);
    const lockButton = buttonPressed(gamepad, 4);

    if (attackButton && !this.previousAttackButton) {
      this.attackQueued = true;
    }

    if (dashButton && !this.previousDashButton) {
      this.dashQueued = true;
    }

    if (lockButton && !this.previousLockButton) {
      this.lockQueued = true;
    }

    if (vectorLength(move) > 0 || attackButton || dashButton || lockButton) {
      this.status = { source: "gamepad", control: "LEFT STICK" };
    }

    this.previousAttackButton = attackButton;
    this.previousDashButton = dashButton;
    this.previousLockButton = lockButton;
    return move;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const code = resolveKeyboardCode(event);
    const isDirection = code in DIRECTION_BY_CODE;
    const isAction =
      DASH_CODES.has(code) || ATTACK_CODES.has(code) || code === LOCK_CODE;

    if (!isDirection && !isAction) {
      return;
    }

    event.preventDefault();
    this.status = { source: "keyboard", control: controlForCode(code) };

    if (isDirection) {
      this.pressedCodes.add(code);
    } else if (event.repeat) {
      // Held buttons must not refill the buffer every frame.
    } else if (ATTACK_CODES.has(code)) {
      this.attackQueued = true;
    } else if (DASH_CODES.has(code)) {
      this.dashQueued = true;
    } else if (code === LOCK_CODE) {
      this.lockQueued = true;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const code = resolveKeyboardCode(event);
    if (
      code in DIRECTION_BY_CODE ||
      DASH_CODES.has(code) ||
      ATTACK_CODES.has(code) ||
      code === LOCK_CODE
    ) {
      event.preventDefault();
    }
    this.pressedCodes.delete(code);
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.eventDocument.hidden) {
      this.clearHeldInput();
    }
  };

  private readonly clearHeldInput = (): void => {
    this.pressedCodes.clear();
    this.attackQueued = false;
    this.dashQueued = false;
    this.lockQueued = false;
    this.previousAttackButton = false;
    this.previousDashButton = false;
    this.previousLockButton = false;
  };
}
