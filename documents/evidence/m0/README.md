# M0 visual verification

Captured on 2026-08-19 with Chromium 150 and software WebGL. Successful captures
were taken after the normal boot path reached `#game-surface[data-ready="true"]`
(asset bundle load, scene construction, GPU prewarm, first render). The failure
capture waited for `data-ready="error"` instead.

- `browser-1024x768.png`: reference viewport acceptance image.
- `browser-1920x1080.png`: responsive desktop image; actor scaling remains uniform.
- `browser-asset-error.png`: the player texture was temporarily moved, proving the
  fallback UI reports `player-mech-static` and its source path. The file was restored
  immediately after capture.
- `production-file-1024x768.png`: the built `dist/index.html` loaded over `file://`,
  exercising the same relative asset-path model used by the packaged Electron shell.

The checked-in PNG dimensions are verified independently with Pillow during review;
the manifest unit test verifies both runtime textures are 256×256.
