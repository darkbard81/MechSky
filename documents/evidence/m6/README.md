# M6 Replay, dev scenario, 브라우저 시각 검증 증거

캡처일: 2026-08-21
환경: Vite 8, Playwright 1.62.1 Chromium, WebGL, 1280×800 viewport,
device scale factor 1

## 재현 명령

```bash
MECHSKY_BROWSER_ARTIFACT_DIR=documents/evidence/m6 npm run demo:m6
```

`npm run check`도 같은 Playwright gate를 `test:browser`로 실행하되 기본 결과는
`test-results/m6-browser/`에 쓴다. Chromium cache가 없으면 먼저
`npx playwright install chromium`을 실행한다.

## Artifact

- [`visual-replay-1280x800.png`](./visual-replay-1280x800.png): debug layer를 끈
  고정 air-combo replay tick 91. 같은 replay를 처음부터 다시 load/step한 두 PNG가
  byte 단위로 일치한 뒤 두 번째 결과를 보존했다.
- [`air-combo-fixed-1280x800.png`](./air-combo-fixed-1280x800.png): 같은 tick에서
  collision, hitbox, combat-state layer를 켠 화면. 실제 snapshot의 airborne 위치,
  active finisher hitbox, tick/hash가 함께 보인다.
- [`debug-overlays-1280x800.png`](./debug-overlays-1280x800.png): world debug와
  ScreenDebug의 combat/performance panel을 모두 켠 화면. DOM HUD의 bounding box는
  toggle 전후 완전히 동일했다.
- [`1000-projectiles-1280x800.png`](./1000-projectiles-1280x800.png):
  `/dev/battle?scenario=1000-projectiles`의 1,000개 deterministic renderer stress
  marker. 이는 projectile combat 구현이 아니라 M6용 draw-load 장면이다.
- [`browser-smoke.json`](./browser-smoke.json): 세 dev URL, debug API 결과,
  fixed replay hash, screenshot 목록을 기록한 machine-readable 결과다.

## 고정 replay 결과

- 포맷: versioned `BattleRecipe + seed + InputFrame[]`
- 길이: 167 tick
- 입력 tick: 1/15 `Z`, 35 `X`, 53 Dash, 55/68 `Z`, 83 `X`
- 적 HP: 900 → 420
- 연결 공격: ground 1 → ground 2 → launcher → air 1 → air 2 → finisher
- tick 91 visual hash: `a395bcca`
- tick 167 final hash: `ca05d879`
- 같은 replay 2회에서 168개 initial/per-tick state hash 전체 일치

## Browser gate 확인 사항

- `/dev/battle?scenario=vertical-slice`가 intro 메뉴 없이 `active`로 시작
- `/dev/battle?scenario=air-combo`가 `replay-auto`로 시작
- `/dev/battle?scenario=1000-projectiles`가 1,000개 marker를 표시
- `window.__GAME_DEBUG__.load/step/dump/toggle` 실제 브라우저 경로 통과
- replay object를 `dump().replay`에서 다시 `load()`해 tick 91 hash 일치
- collision/hitbox/combat/performance toggle 후 일반 DOM HUD layout 불변
- console error와 page error 없음
- assertion 실패 시 `failure-1280x800.png`와 `failure-state.json`을 남기며,
  visual replay 불일치 시 expected/actual PNG를 각각 남김

사용자가 2026-08-21 실제 실행 화면에서 위 세 dev scenario와 debug/visual replay
결과를 확인하고 모두 승인했다.

## SHA-256

```text
9915e9976681cb6cb123256ce89e69045e462adf65bf30a4ce7a9059541beda5  1000-projectiles-1280x800.png
069a446a9c654a8778e0bc0ae122de2b5a8aa2566f5f02db4584134031d06baf  air-combo-fixed-1280x800.png
cc63e6a03a47717b4d01aeba84847b14f31386e79a1c88f5583e9792319c0e27  browser-smoke.json
b25193ea54147ed117a3e5c8877f22b95d66aa6099b98c5d2d51751708b5936f  debug-overlays-1280x800.png
2d1aacf599a62e4fb42cfb5411742d418f53ffe3326549983d678b0ab8347cae  visual-replay-1280x800.png
```
