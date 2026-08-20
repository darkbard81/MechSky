# M2 ground combo and hit reaction verification

Captured on 2026-08-20 with Chromium 150, PixiJS WebGL, and the normal browser
boot path at 1024×768. The page was reloaded before the run, so the scenario
starts from a clean spawn. Capture began only after
`#game-surface[data-ready="true"]`, and every input was delivered as a real
Chrome DevTools Protocol keyboard event through the same listeners a player
uses. No simulation state was mutated by the harness.

Evidence:

- `combat-hit-miss.mp4`: exactly 10.000 seconds, 1024×768, H.264, 30 fps,
  300 frames. Contains the whiff, the single hit, the two-hit combo, and the
  late follow-up that refuses to chain.
- `contact-sheet.png`: one frame per second from the clip.
- `active-hitbox-frame6.png`: the attack's own active frame with the F2 debug
  overlay on, so the drawn hitbox can be compared against the judgement that
  produced the damage.

## Scenario timeline

Read straight from the DOM HUD at each step.

| step | enemy HP | combo | HUD action |
|---|---:|---:|---|
| start | 900 | 0 | NONE |
| whiff during swing | 900 | 0 | MECH-GROUND-1 |
| approached and locked | 900 | 0 | NONE |
| first hit | 840 | 1 | MECH-GROUND-1 |
| after single hit | 840 | 0 | NONE |
| combo second swing | 690 | 2 | **MECH-GROUND-2** |
| late follow-up, first swing | 630 | 1 | MECH-GROUND-1 |
| late follow-up, second swing | 570 | 1 | **MECH-GROUND-1** |
| combo with hitbox overlay | 420 | 2 | MECH-GROUND-2 |
| end | 360 | 0 | NONE |

What each row establishes:

- A swing out of range plays its full timeline and takes no health, so miss and
  hit are separated by more than a visual effect.
- The first hit takes exactly its authored 60 damage; the chained second hit
  takes 90.
- A follow-up inside the cancel window reaches `MECH-GROUND-2` and the combo
  counter reaches 2.
- A follow-up pressed after the window closed never reaches `MECH-GROUND-2`:
  both swings are `MECH-GROUND-1` and the counter never leaves 1.

The too-early press needs frame-exact timing that CDP cannot deliver reliably,
so it is pinned by `tests/combat/ground-combo.test.ts` instead, which presses on
tick 1 and tick 2 and asserts only one hit lands.

## Active hitbox against real judgement

`active-hitbox-frame6.png` is a `Page.startScreencast` frame, not a
poll-then-screenshot: the active window is four frames (67 ms) and a screenshot
round trip lands in recovery. The frame shows `MECH-GROUND-1 ACTIVE 6/23` with
the red attack hitbox drawn in front of the player, the enemy hurtbox capsule
inside it, and the impact spark at the overlap. Enemy health already reads
360/900 for that connect.

## Automated coverage

`tests/combat/` holds 28 assertions over the same rules: startup/active/recovery
frame boundaries, hit-gated cancel windows, one hit per swing per target,
hit-stop freezing both action clocks while the world tick continues, damage,
hitstun, knockback direction, combo reset, spatial hash candidate lookup, and
the plane-and-height hit condition.

## Reproduction

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9224 \
MECHSKY_CAPTURE_DIR=/tmp/mechsky-m2-frames \
MECHSKY_PROOF_DIR=/tmp/mechsky-m2-proof \
npm run demo:m2
```

The harness needs Node 22 or newer for the global `WebSocket`.

Checksums:

```text
0e4bd0a7ce90b0e51f63a5e8402b2fe2de85e11a44b97cd788ee6edd3e85d62b  active-hitbox-frame6.png
1a1a0d8e2a36ba19ede8bdadbe269fdd5232b81d6330e15a9b659ae8b57a6b4a  combat-hit-miss.mp4
b6b761123b5c0fffc8a613ae6c600b09a82d3ff4e48ec3b1b7ee57bf9a949517  contact-sheet.png
```
