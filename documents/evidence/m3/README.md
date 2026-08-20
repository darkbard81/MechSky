# M3 air combo and ground-slam verification

Captured on 2026-08-20 with Chromium, PixiJS WebGL, and the normal browser boot
path at 1024×768. The page was reloaded before the run, and every action was
delivered as a real Chrome DevTools Protocol keyboard event through the normal
player input adapter. The harness did not mutate simulation state.

The user reviewed the live M3 execution screen on 2026-08-20 and confirmed all
visible completion conditions as OK. Future runtime-screen judgement remains a
user review gate.

Evidence:

- `air-combo-ground-slam.mp4`: 10.533 seconds, 1024×768, H.264, 15 fps,
  158 consecutive frames. The captured sequence is encoded without trimming.
- `launcher-airborne.png`: the launcher has dealt its third combo hit and the
  enemy is visibly separated from its ground shadow.
- `homing-chase.png`: the player is airborne and homing toward the launched
  enemy while both ground positions remain represented by their shadows.
- `air-combo.png`: the two air hits have reduced enemy HP to 560 while the
  elevated player remains separated from the ground plane.
- `ground-slam.png`: the finisher has reduced enemy HP to 420 and the enemy is
  downed at the ground-impact effect.

## Automated coverage

`tests/combat/air-combo.test.ts` executes the exact
`J → J → K → Shift → J → J → K` path and asserts all six hits, launcher velocity,
homing, downward finisher velocity, non-negative elevation, ground impact,
48-tick knockdown, wake-up, normal landing, and ground/air height misses.

`tests/sim/render-rate-determinism.test.ts` records the same seven input frames
and verifies an identical tick-360 snapshot at 60, 120, and 144 Hz render
cadences, including a 50 ms dropped-frame catch-up. Projection and camera tests
separately pin ground-shadow/elevated-sprite placement and airborne framing.

Final gates:

```text
npm run check  -> 13 files, 80 tests passed
npm run build  -> check + web build + Electron build passed
```

## Reproduction

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9225 \
MECHSKY_CAPTURE_DIR=/tmp/mechsky-m3-frames \
MECHSKY_PROOF_DIR=/tmp/mechsky-m3-proof \
npm run demo:m3
```

The harness needs Node 22 or newer for the global `WebSocket`.

Checksums:

```text
16fa751d902ef0e2ec03db1f991f3ca817a58e5cea43dfe3b13a25460359ff54  air-combo-ground-slam.mp4
84b721c6ed6875859a52d57a3f53a98721d622f7e8972b44de829807ebf766c8  air-combo.png
c7293857537a24f7228d0840c6b40460f7e7ecd707cfdea586435ce9e68f587b  ground-slam.png
c0e3d126a401f6010a91a09d25b3a113312987d33fd55e67b1c243d5352ddc53  homing-chase.png
53c90bf88f65752eec682c8d4e51d982acb4b2ed55519c21dda84dcd46ada5c0  launcher-airborne.png
```
