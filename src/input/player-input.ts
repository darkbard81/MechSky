import type { AttackButton, CommandIntent } from "../sim/input/command-intent";
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

const SEARCH_DASH_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const ATTACK_BUTTON_BY_CODE: Readonly<Record<string, AttackButton>> = Object.freeze({
  KeyZ: "A",
  KeyX: "B",
  KeyC: "C",
});
const LOCK_CODE = "Tab";
const CONFIRM_CODES = new Set(["Enter", "KeyZ"]);
const PAUSE_CODE = "Escape";
const GAMEPAD_ATTACK_BUTTON_INDEXES: Readonly<Record<number, AttackButton>> =
  Object.freeze({ 0: "A", 2: "B", 3: "C" });
/** Attack A doubles as the menu confirm, the same way Enter does on keyboard. */
const GAMEPAD_CONFIRM_INDEX = 0;
const GAMEPAD_SEARCH_DASH_INDEX = 1;
const GAMEPAD_LOCK_INDEX = 4;
const GAMEPAD_PAUSE_INDEX = 9;

export function attackButtonForCode(code: string): AttackButton | null {
  return ATTACK_BUTTON_BY_CODE[code] ?? null;
}

export type InputSource = "keyboard" | "gamepad";
export type InputControl = "WASD" | "ARROWS" | "NUMPAD" | "KEYBOARD" | "LEFT STICK";

export interface InputStatus {
  readonly source: InputSource;
  readonly control: InputControl;
}

export interface FlowInput {
  readonly confirm: boolean;
  readonly pause: boolean;
}

export interface PlayerInputFrame {
  readonly intents: readonly CommandIntent[];
  readonly flow: FlowInput;
}

export function resolveKeyboardCode(event: Pick<KeyboardEvent, "code" | "key" | "location">): string {
  if (
    event.code in DIRECTION_BY_CODE ||
    SEARCH_DASH_CODES.has(event.code) ||
    attackButtonForCode(event.code) !== null ||
    event.code === LOCK_CODE ||
    CONFIRM_CODES.has(event.code) ||
    event.code === PAUSE_CODE
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

const TRACKED_GAMEPAD_BUTTONS: readonly number[] = Object.freeze([
  ...Object.keys(GAMEPAD_ATTACK_BUTTON_INDEXES).map(Number),
  GAMEPAD_SEARCH_DASH_INDEX,
  GAMEPAD_LOCK_INDEX,
  GAMEPAD_PAUSE_INDEX,
]);

function buttonPressed(gamepad: Gamepad, index: number): boolean {
  return gamepad.buttons[index]?.pressed ?? false;
}

export class PlayerInputController {
  private readonly pressedCodes = new Set<string>();
  private readonly heldSearchDashCodes = new Set<string>();
  private queuedAttackButton: AttackButton | null = null;
  private searchDashQueued = false;
  private gamepadSearchDashHeld = false;
  private lockQueued = false;
  private confirmQueued = false;
  private pauseQueued = false;
  private readonly previousGamepadButtons = new Set<number>();
  private gamepadConnected = false;
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

  sampleFrame(): PlayerInputFrame {
    const keyboardMove = keyboardMoveVector(this.pressedCodes);
    const gamepadMove = this.pollGamepad();
    const move =
      vectorLength(gamepadMove) > vectorLength(keyboardMove)
        ? gamepadMove
        : keyboardMove;
    const intents: CommandIntent[] = [
      { type: "move", fighterId: this.fighterId, direction: move },
    ];

    if (this.queuedAttackButton !== null) {
      intents.push({
        type: "attack",
        fighterId: this.fighterId,
        button: this.queuedAttackButton,
      });
      this.queuedAttackButton = null;
    }

    const searchDashHeld =
      this.heldSearchDashCodes.size > 0 || this.gamepadSearchDashHeld;
    if (this.searchDashQueued || searchDashHeld) {
      intents.push({
        type: "search-dash",
        fighterId: this.fighterId,
        pressed: this.searchDashQueued,
        held: searchDashHeld,
      });
      this.searchDashQueued = false;
    }

    if (this.lockQueued) {
      intents.push({ type: "lock-target", fighterId: this.fighterId });
      this.lockQueued = false;
    }

    const frame = {
      intents,
      flow: {
        confirm: this.confirmQueued,
        pause: this.pauseQueued,
      },
    } as const;
    this.confirmQueued = false;
    this.pauseQueued = false;
    return frame;
  }

  sampleIntents(): readonly CommandIntent[] {
    return this.sampleFrame().intents;
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

  resetBattleInput(): void {
    this.pressedCodes.clear();
    this.heldSearchDashCodes.clear();
    this.queuedAttackButton = null;
    this.searchDashQueued = false;
    this.lockQueued = false;
    this.confirmQueued = false;
    this.pauseQueued = false;
  }

  private pollGamepad(): Vector2 {
    const gamepad = this.readGamepads().find((candidate) => candidate?.connected);

    if (gamepad === undefined || gamepad === null) {
      this.gamepadConnected = false;
      this.gamepadSearchDashHeld = false;
      this.previousGamepadButtons.clear();
      return { ...ZERO_VECTOR };
    }

    if (!this.gamepadConnected) {
      this.gamepadConnected = true;
      this.status = { source: "gamepad", control: "LEFT STICK" };
    }

    const move = applyGamepadDeadzone(
      gamepad.axes[0] ?? 0,
      gamepad.axes[1] ?? 0,
    );
    let anyButtonPressed = false;

    for (const [index, button] of Object.entries(GAMEPAD_ATTACK_BUTTON_INDEXES)) {
      if (this.gamepadRisingEdge(gamepad, Number(index))) {
        this.queuedAttackButton = button;
      }
    }

    if (this.gamepadRisingEdge(gamepad, GAMEPAD_CONFIRM_INDEX)) {
      this.confirmQueued = true;
    }

    this.gamepadSearchDashHeld = buttonPressed(gamepad, GAMEPAD_SEARCH_DASH_INDEX);
    if (this.gamepadRisingEdge(gamepad, GAMEPAD_SEARCH_DASH_INDEX)) {
      this.searchDashQueued = true;
    }

    if (this.gamepadRisingEdge(gamepad, GAMEPAD_LOCK_INDEX)) {
      this.lockQueued = true;
    }

    if (this.gamepadRisingEdge(gamepad, GAMEPAD_PAUSE_INDEX)) {
      this.pauseQueued = true;
    }

    for (const index of TRACKED_GAMEPAD_BUTTONS) {
      if (buttonPressed(gamepad, index)) {
        anyButtonPressed = true;
        this.previousGamepadButtons.add(index);
      } else {
        this.previousGamepadButtons.delete(index);
      }
    }

    if (vectorLength(move) > 0 || anyButtonPressed) {
      this.status = { source: "gamepad", control: "LEFT STICK" };
    }

    return move;
  }

  /** True only on the frame the button goes down, so held buttons stay quiet. */
  private gamepadRisingEdge(gamepad: Gamepad, index: number): boolean {
    return buttonPressed(gamepad, index) && !this.previousGamepadButtons.has(index);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const code = resolveKeyboardCode(event);
    const isDirection = code in DIRECTION_BY_CODE;
    const isAction =
      SEARCH_DASH_CODES.has(code) ||
      attackButtonForCode(code) !== null ||
      code === LOCK_CODE ||
      CONFIRM_CODES.has(code) ||
      code === PAUSE_CODE;

    if (!isDirection && !isAction) {
      return;
    }

    event.preventDefault();
    this.status = { source: "keyboard", control: controlForCode(code) };

    if (!event.repeat && CONFIRM_CODES.has(code)) {
      this.confirmQueued = true;
    }
    if (!event.repeat && code === PAUSE_CODE) {
      this.pauseQueued = true;
    }

    if (isDirection) {
      this.pressedCodes.add(code);
      return;
    }

    // The held state still has to track a repeat, only the edge must not.
    if (SEARCH_DASH_CODES.has(code)) {
      this.searchDashQueued ||= !event.repeat;
      this.heldSearchDashCodes.add(code);
      return;
    }

    if (event.repeat) {
      return;
    }

    const attackButton = attackButtonForCode(code);
    if (attackButton !== null) {
      this.queuedAttackButton = attackButton;
    } else if (code === LOCK_CODE) {
      this.lockQueued = true;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const code = resolveKeyboardCode(event);
    if (
      code in DIRECTION_BY_CODE ||
      SEARCH_DASH_CODES.has(code) ||
      attackButtonForCode(code) !== null ||
      code === LOCK_CODE ||
      CONFIRM_CODES.has(code) ||
      code === PAUSE_CODE
    ) {
      event.preventDefault();
    }
    this.pressedCodes.delete(code);
    this.heldSearchDashCodes.delete(code);
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.eventDocument.hidden) {
      this.clearHeldInput();
    }
  };

  private readonly clearHeldInput = (): void => {
    this.resetBattleInput();
    this.gamepadSearchDashHeld = false;
    this.previousGamepadButtons.clear();
  };
}
