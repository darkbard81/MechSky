# M1 movement verification

Captured on 2026-08-19 with Chromium 150, PixiJS WebGL, and the normal browser
boot path. The browser reached `#game-surface[data-ready="true"]` before capture.
Input was then delivered as real Chrome DevTools Protocol keyboard events through
the same listeners used by a player; no simulation state was mutated by the
capture harness.

Evidence:

- `movement-dash-boundary.mp4`: exactly 10.000 seconds, 1024×768, H.264, 30 fps.
- `contact-sheet.png`: one frame per second from the clip.
- `dash-afterimage.png`: dash frame showing 640 units/s, cyan boost, and pooled
  mech afterimages.
- `initial-1024x768.png`: ready-state reference frame before input.
- `final-smoke-1024x768.png`: post-review ready-state smoke frame at the target
  viewport.

The clip input sequence uses `KeyD`, `KeyW + KeyD`, `ShiftLeft`, `Tab`,
`Numpad2`, `Numpad6`, and `Numpad4`. It shows acceleration, normalized diagonal
movement, lock-on, two dash attempts, sustained movement into the circular arena
boundary, and movement away from that boundary. The HUD exposes position,
velocity, state, cooldown, target lock, and the active keyboard/NumPad source.

Frame inspection confirmed:

- ordinary full-speed movement is 255 units/s;
- dash reaches 640 units/s and displays boost/afterimages;
- the player center stops at radius 352, exactly `arena radius 380 - body radius 28`;
- the lock reticle becomes visible and the HUD reports `LOCKED`;
- NumPad events reach the normal input path and the HUD reports `NUMPAD`.

The checked-in automation entrypoint is:

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9224 \
MECHSKY_CAPTURE_DIR=/tmp/mechsky-m1-frames \
npm run demo:m1
```

`tests/sim/render-rate-determinism.test.ts` runs the same 10-second tick script
under 60, 120, and 144 Hz render schedules and requires the complete 600th-tick
snapshot to be identical. The remaining simulation/input/render tests cover key
and NumPad mappings, gamepad deadzone parity, diagonal speed, collision, dash
cooldown, interpolation, ground-Y sorting, and time-correct camera smoothing.
