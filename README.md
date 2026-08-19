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

## 검증

```bash
npm run check
npm run build
```

`npm run check`는 ESLint, renderer/Electron TypeScript 검사, simulation 단위 테스트를
순서대로 실행한다. ESLint는 `src/sim`에서 PixiJS, Electron, DOM, render/UI import를
금지하여 simulation 경계를 유지한다.

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
```

`src/render/pixi-renderer.ts`는 PixiJS ticker를 자동 시작하지 않는다. `GameApp`이
simulation을 고정 스텝으로 전진시키고 이전/현재 snapshot과 interpolation alpha를
renderer에 전달한 뒤 명시적으로 render한다.
