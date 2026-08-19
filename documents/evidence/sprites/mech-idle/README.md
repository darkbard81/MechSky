# Four-direction idle runtime verification

Captured on 2026-08-19 from the normal Vite browser boot path with Chromium 150,
PixiJS WebGL, and a 1024×768 viewport. The capture started only after
`#game-surface[data-ready="true"]` and delivered normal CDP keyboard events to
the same input listeners used by a player.

Evidence:

- `directional-idle-runtime.mp4`: exactly 10.000 seconds, 1024×768, H.264,
  30 fps, 300 frames.
- `runtime-directions-contact-sheet.png`: four runtime frames arranged as
  front/down, left, right, and back/up.

The existing `npm run demo:m1` scenario uses `KeyD`, `KeyW + KeyD`,
`Numpad2`, `Numpad6`, and `Numpad4`, so the clip exercises all four directional
rows through the real fixed-tick input path. The last 1.2 seconds remain idle
while facing left and visibly cover multiple phases of the 200 ms idle loop.
Moving and dashing use directional neutral frame zero; dash afterimages copy the
current player subtexture when emitted.

Visual inspection confirmed:

- front visor, rear armor, and true left/right silhouettes select correctly;
- no frame crosses a 256×256 cell and no blank texture flash occurs;
- feet remain aligned to y=228 and stay attached to the ground shadow;
- no magenta chroma fringe is visible in the rendered scene;
- scale remains stable through direction changes and idle phases.

Checksums:

```text
cb7d243aceb5c4987378ad7b5d82029024fa0399e1e75b74aefe2975e25f10a9  directional-idle-runtime.mp4
2bda063c90415ac827902ab7a1dd968f9919312ebd0a55c94a66f3886883ec14  runtime-directions-contact-sheet.png
8be2595e7084553fa3d4b818c0f8893fa70f6bf9b44ab171c47d8992894d386c  public/assets/characters/player/mech-idle-4dir.png
```
