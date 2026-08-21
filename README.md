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

Electron의 초기 content viewport는 `1024×768`이다. 첫 화면은
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

## 주요 구조

```text
src/app/        애플리케이션 수명주기와 수동 frame loop
src/sim/        renderer 및 플랫폼과 독립된 simulation
src/render/     PixiJS WebGL 표현 계층
src/ui/         Vanilla DOM UI
src/platform/   브라우저/Electron 어댑터
electron/       main process와 sandbox preload
tests/sim/      순수 simulation 테스트
public/assets/  PixiJS bundle manifest와 정적 에셋
assets/         imagegen 원본과 asset pipeline QC 메타데이터
```

`src/render/pixi-renderer.ts`는 PixiJS ticker를 자동 시작하지 않는다. `GameApp`이
simulation을 고정 스텝으로 전진시키고 이전/현재 snapshot과 interpolation alpha를
renderer에 전달한 뒤 명시적으로 render한다.
