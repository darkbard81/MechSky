# MechSky

`documents/baldr_sky_architecture.md`를 기준으로 만든 기본 개발환경이다.
전투 코어는 고정 60 Hz TypeScript simulation으로 실행하고, PixiJS는 표현만,
DOM은 애플리케이션 UI만, Electron은 OS 셸과 제한된 IPC만 담당한다.

## 요구 환경

- Node.js 24 권장 (`.nvmrc` 제공, 최소 22.12)
- npm 10 이상
- Electron 실행 시 그래픽 세션

## 시작

```bash
npm install
npm run dev
```

브라우저 개발 서버는 `http://127.0.0.1:5173`에서 실행된다.

Electron 셸과 함께 실행하려면:

```bash
npm run dev:electron
```

Electron의 초기 content viewport 요청값은 `1280×800`이다. window manager의 work area가
우선할 수 있으며, 첫 화면은
`battle-common` PixiJS bundle을 로드하고 texture를 GPU에 prewarm한 뒤 표시한다.

## 검증

```bash
npm run check
npm run build
```

M3 공중 콤보는 개발 서버에서 적에게 접근한 뒤 다음 순서로 확인한다.

```text
Z → Z → X → Shift → Z → Z → X
```

키보드 `X`는 지상에서 Launcher, 공중에서 Finisher이며 gamepad에서도 `X`다. `Shift`/`B`는
공중에 뜬 적이 있을 때 homing chase로 전환된다. CDP 입력 재현은 이미 remote debugging
상태로 열린 Chromium에 `npm run demo:m3`를 실행한다.

`npm run check`는 ESLint, renderer/Electron TypeScript 검사, simulation 단위 테스트를
순서대로 실행한다. ESLint는 `src/sim`에서 PixiJS, Electron, DOM, render/UI import를
금지하여 simulation 경계를 유지한다.

## M5 한 판 진행

자산 준비 뒤 intro 화면에서 `Enter` 또는 `Z`로 시작한다. gamepad가 연결되어 있으면
안내가 자동으로 Steam Deck 기준으로 바뀌며 `A`로 시작한다. 적은 잠시 관찰한 뒤 접근,
간격 유지, 단발 공격과 짧은 회피를 수행한다.

- `Esc` / `Menu`: pause 또는 resume
- 결과 화면의 `Enter` / `A`: 한 번의 입력으로 즉시 retry
- retry 시 HP, 위치, combo, AI seed, 입력 buffer, 전투 FX가 초기화됨

1280×800 Chromium CDP에서 승리 또는 패배 full-run을 재현하려면:

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9226 \
MECHSKY_M5_MODE=victory \
npm run demo:m5
```

`MECHSKY_M5_MODE=defeat`는 입력 없이 AI의 패배 경로를 재현한다. 여기에
`MECHSKY_M5_INPUT=gamepad`를 추가하면 표준 Gamepad API에서 A 시작/retry와 Menu
pause/resume도 함께 검증한다. 상세 증거와 사용자 확인 항목은
[`documents/evidence/m5/README.md`](documents/evidence/m5/README.md)에 있다.

## M6 Replay와 dev scenario

개발 서버에서는 메뉴 입력 없이 다음 장면을 바로 열 수 있다.

```text
http://127.0.0.1:5173/dev/battle?scenario=vertical-slice
http://127.0.0.1:5173/dev/battle?scenario=air-combo
http://127.0.0.1:5173/dev/battle?scenario=1000-projectiles
```

`air-combo`는 167 tick 고정 replay를 자동 재생한다. `1000-projectiles`는 projectile
combat을 추가하는 장면이 아니라, snapshot tick에서 파생된 1,000개 dev stress marker를
정렬 없는 projectile layer에 표시하는 renderer 부하 확인 장면이다.

브라우저 DevTools에서는 `window.__GAME_DEBUG__`로 같은 replay를 수동 진행할 수 있다.

```js
window.__GAME_DEBUG__.load("air-combo");
window.__GAME_DEBUG__.step(91);
window.__GAME_DEBUG__.dump().stateHash; // a395bcca
window.__GAME_DEBUG__.toggle("hitbox");
window.__GAME_DEBUG__.toggle("combat");
window.__GAME_DEBUG__.toggle("performance");
```

`dump().replay`는 JSON 호환 `BattleRecipe + seed + InputFrame[]`이며 다시 `load()`에
전달할 수 있다. `step()`은 rAF와 무관하게 정확한 60 Hz tick만 진행한다.

`npm run check`는 unit test 뒤 임시 Vite 서버와 Playwright Chromium을 실행해 세 URL,
debug API, 동일 replay의 state hash와 1280×800 PNG byte 일치, HUD layout 불변을
검증한다. Chromium이 아직 없으면 한 번 설치한다.

```bash
npx playwright install chromium
npm run test:browser
```

기본 screenshot artifact는 `test-results/m6-browser/`에 남는다. milestone 증거와
고정 hash는 [`documents/evidence/m6/README.md`](documents/evidence/m6/README.md)에
정리되어 있다.

## M7 후보 빌드

일반 사용자 route는 1280×800과 1920×1080에서 개발용 simulation/movement HUD를 숨기고
전투 HUD, 조작 안내, intro/pause/result만 표시한다. focus를 잃으면 전투가 자동 pause되며
창으로 돌아온 뒤 `Esc` 또는 Gamepad `Menu`로 명시적으로 재개한다. 전체 화면 button은
Browser Fullscreen API 또는 제한된 Electron IPC만 사용한다.

production 후보를 두 플랫폼에서 직접 실행하려면:

```bash
npm run build
npm run preview  # Browser production preview
npm start        # Electron production file:// shell
```

`npm run build`는 기존 unit/M6 browser gate 뒤 production 최적화를 적용한 계측
release-candidate와 실제 Electron package entry를 검사한다. gate가 끝나면
`window.__GAME_DEBUG__`가 제거된 shipping web bundle을 다시 만들고 별도 부팅 smoke로
API 부재를 확인한다. headed 화면, keyboard/gamepad 전체 공중 콤보, 두 해상도 layout,
focus/fullscreen/reduced-motion과 timing evidence를 다시 만들려면:

```bash
npm run demo:m7
```

`demo:m7`도 증거 생성이 끝난 뒤 shipping web bundle을 다시 만들어 계측 API를 남기지
않는다. 개발 서버에서는 `window.__GAME_DEBUG__`를 계속 사용할 수 있다.

production relative asset base에서는 `/?devScenario=air-combo`처럼 root query를 사용한다.
개발 서버의 기존 `/dev/battle?scenario=air-combo` 경로도 유지된다. 상세 수치, object pool
감사와 알려진 제한은
[`documents/evidence/m7/README.md`](documents/evidence/m7/README.md)에 있다.

## 주요 구조

```text
src/app/        애플리케이션 수명주기와 수동 frame loop
src/sim/        renderer 및 플랫폼과 독립된 simulation/replay
src/render/     PixiJS WebGL 표현 계층
src/ui/         Vanilla DOM UI
src/platform/   브라우저/Electron 어댑터
src/testing/    dev battle scenario와 고정 replay
electron/       main process와 sandbox preload
tests/sim/      순수 simulation 테스트
tests/replay/   replay format, hash, scenario 결정성 테스트
public/assets/  PixiJS bundle manifest와 정적 에셋
assets/         imagegen 원본과 asset pipeline QC 메타데이터
```

`src/render/pixi-renderer.ts`는 PixiJS ticker를 자동 시작하지 않는다. `GameApp`이
simulation을 고정 스텝으로 전진시키고 이전/현재 snapshot과 interpolation alpha를
renderer에 전달한 뒤 명시적으로 render한다.
