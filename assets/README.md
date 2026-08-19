# Asset source and runtime pipeline

Creative source files and runtime-ready files stay separate:

- `../mech.png` is the canonical player reference supplied with the project.
- `source/arenas/hangar/hangar-floor-imagegen.png` is the retained `$imagegen` source.
- `../public/assets/**` contains only runtime files loaded by PixiJS.
- `metadata/**` records deterministic post-processing and QC results.

All sprite runtime cells and arena runtime units are exactly 256×256 pixels.

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

## Player four-direction idle sheet

The runtime player now uses
`public/assets/characters/player/mech-idle-4dir.png`, a 1024×1024 sheet made
from sixteen 256×256 cells. Rows are `down/front`, `left`, `right`, `up/back`;
each row contains four 200 ms rooted idle frames.

The four accepted 2×2 raw sheets were produced separately with built-in
`$imagegen`, using `mech.png` as the identity reference. The normalized prompt
record is in `source/characters/player/mech-idle-directional/prompt-used.txt`.
Each direction folder retains the original RGB raw sheet, the soft-matte/despill
RGBA source, `generate2dsprite` frames, a direction GIF, and strict QC metadata.

Chroma removal uses the installed `$imagegen` helper before sprite processing:

```bash
python /home/deck/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input <direction>/raw-sheet.png \
  --out <direction>/raw-sheet-keyed.png \
  --auto-key border --soft-matte \
  --transparent-threshold 12 --opaque-threshold 220 --despill
```

The back sheet additionally uses `--edge-contract 1` after visual fringe
inspection. Each keyed 2×2 sheet is normalized with this contract:

```bash
python /home/deck/.codex/skills/generate2dsprite/scripts/generate2dsprite.py process \
  --input <direction>/raw-sheet-keyed.png \
  --target player --mode idle \
  --output-dir <direction>/processed \
  --prompt-file source/characters/player/mech-idle-directional/prompt-used.txt \
  --cell-size 256 --fit-scale 0.78 \
  --align feet --shared-scale --scale-strategy fit \
  --component-mode largest --strict-qc \
  --max-body-scale-cv 0.08 --max-anchor-y-std 0.05 \
  --duration 200
```

The accepted down sheet writes the shared
`mech-idle-scale-profile.json`; the back sheet reuses it. Side silhouettes are
strict-QC processed with the same explicit settings because their naturally
narrower area makes an area-based front profile comparison misleading. All
sixteen output frames end at y=228, and every source/output edge-touch,
paste-clamp, and empty-frame list is empty. The four row strips are assembled
without rescaling into `assembled/sheet-transparent.png`, then copied to the
runtime path. The aggregate contract is recorded in
`metadata/characters/player/mech-idle-directional.pipeline.json`.

## Hangar floor

The imagegen source prompt is stored beside the source PNG. The runtime tile is a
deterministic Lanczos downscale:

```bash
ffmpeg -i assets/source/arenas/hangar/hangar-floor-imagegen.png \
  -vf "scale=256:256:flags=lanczos" -frames:v 1 \
  public/assets/arenas/hangar/hangar-floor.png
```
