# Asset source and runtime pipeline

Creative source files and runtime-ready files stay separate:

- `../mech.png` is the canonical player reference supplied with the project.
- `source/arenas/hangar/hangar-floor-imagegen.png` is the retained `$imagegen` source.
- `../public/assets/**` contains only runtime files loaded by PixiJS.
- `metadata/**` records deterministic post-processing and QC results.

All current sprite and arena runtime units are exactly 256×256 pixels.

## Player static frame

The checked-in runtime frame was produced with the installed `generate2dsprite`
processor. The source already has transparency, so border trimming and chroma edge
cleanup are disabled. Source-edge contact is explicitly accepted after visual review;
processed output-edge contact remains forbidden.

```bash
python /home/deck/.codex/skills/generate2dsprite/scripts/generate2dsprite.py process \
  --input mech.png \
  --target player \
  --mode static \
  --rows 1 \
  --cols 1 \
  --label-prefix mech-static \
  --output-dir <temporary-output> \
  --cell-size 256 \
  --fit-scale 0.78 \
  --trim-border 0 \
  --edge-clean-depth 0 \
  --align feet \
  --shared-scale \
  --scale-strategy fit \
  --component-mode all \
  --strict-qc \
  --allow-source-edge-touch
```

Copy `sheet-transparent.png` to
`public/assets/characters/player/mech-static.png` after visual QC.

## Hangar floor

The imagegen source prompt is stored beside the source PNG. The runtime tile is a
deterministic Lanczos downscale:

```bash
ffmpeg -i assets/source/arenas/hangar/hangar-floor-imagegen.png \
  -vf "scale=256:256:flags=lanczos" -frames:v 1 \
  public/assets/arenas/hangar/hangar-floor.png
```
