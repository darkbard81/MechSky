# M7 수직 슬라이스 후보 빌드 증거

캡처일: 2026-08-21

환경: Vite 8 production preview, Playwright 1.62.1 headed Chromium/WebGL,
Electron 43 production `file://` shell, device scale factor 1

상태: 자동 승인 기준 통과, Gate G 사용자 실행 화면 확인 완료

## 재현 명령

```bash
npm run demo:m7
```

이 명령은 web/Electron production 산출물을 다시 만든 뒤 실제 화면이 있는 Chromium과
직접 package entry로 실행한 Electron을 검사한다. 일반 `npm run build`도 같은 release
gate를 headless browser + headed Electron 경로로 실행하며 결과는
`test-results/m7-release/`에 쓴다.

## 화면 증거

- [`browser-1280x800-intro.png`](./browser-1280x800-intro.png): Steam Deck 기준
  후보 빌드 intro. 일반 사용자 route에서는 simulation/movement 개발 HUD를 숨긴다.
- [`browser-1920x1080-intro.png`](./browser-1920x1080-intro.png): desktop 기준
  후보 빌드 intro.
- [`browser-reduced-motion-1280x800.png`](./browser-reduced-motion-1280x800.png):
  `prefers-reduced-motion: reduce`에서 카메라 흔들림을 20%로 낮춘 air-combo 장면.
- [`keyboard-core-combo-1280x800.png`](./keyboard-core-combo-1280x800.png): 실제
  표준 route의 반격 AI를 상대로 `Z → Z → X → Shift → Z → Z → X`를 입력한 Ground
  Slam 결과.
- [`keyboard-victory-1280x800.png`](./keyboard-victory-1280x800.png): keyboard로
  두 번의 전체 콤보를 연결한 승리 화면. 같은 경로에서 `Enter` 1회 retry도 검증했다.
- [`gamepad-core-combo-1280x800.png`](./gamepad-core-combo-1280x800.png): 표준
  Gamepad API의 `A → A → X → B → A → A → X` 전체 콤보 결과.
- [`electron-production.png`](./electron-production.png): production `file://` bundle을
  실제 Electron package entry로 실행하고 동일 replay tick 91을 표시한 화면.
- [`release-smoke.json`](./release-smoke.json): layout 좌표, 입력 결과, performance와
  Browser/Electron parity를 기록한 machine-readable 결과.

## 요구사항별 결과

### Layout과 수명주기

- 1280×800: battle panel `944×679.22`, 후보 정보 panel `288×679.22`; 가로 overflow와
  두 panel 겹침이 없다.
- 1920×1080: battle panel `1440×871.41`, 후보 정보 panel `368×871.41`; 가로
  overflow와 두 panel 겹침이 없다.
- 두 해상도에서 combat HUD와 intro/result card가 겹치지 않고 prompt가 card 내부에 있다.
- boot overlay가 사라지고 `data-ready=true`가 된 뒤에만 검사를 시작한다.
- focus loss tick `3`에서 자동 pause되고 명시적 `Esc` 입력 후 tick `4`부터 재개됐다.
- Browser와 Electron 모두 fullscreen 진입 후 복귀했으며 Electron content viewport는
  `1920×1048`로 정확히 복원됐다.
- fullscreen button의 focus-visible ring과 `aria-pressed` 상태를 실제 DOM에서 검증했다.

### 한 판과 입력

- keyboard 표준 후보 전투는 반격 AI를 상대로 `5.786초`, tick `348`에 승리해 90초
  제한을 만족했다.
- keyboard와 gamepad 모두 주 공격, launcher, homing chase, 공중 2타, finisher,
  Ground Slam 전체 경로를 장치 adapter의 실제 rising-edge 입력으로 실행했다.
- 승리 화면에서 `Enter` 1회로 HP `1000/900`, ongoing 상태로 즉시 retry됐다.
- Browser와 Electron에서 replay tick 91 state hash가 모두 `a395bcca`였다.

### Performance

240 simulation tick 동안 실제 wall-clock instrumentation을 집계했다.

| 환경 | FPS | frame avg/max | sim avg/max | collision+hit avg/max | AI avg/max | >34 ms spike |
|---|---:|---:|---:|---:|---:|---:|
| Headed Browser | 60.00 | 16.667 / 16.800 ms | 0.071 / 1.300 ms | 0.010 / 0.600 ms | 0.011 / 0.300 ms | 0 |
| Electron | 59.00 | 16.949 / 83.200 ms | 0.059 / 1.500 ms | 0.012 / 0.500 ms | 0.006 / 0.300 ms | 1 |

승인 budget은 simulation 평균 `<3 ms`, collision+hit 평균 `<1.5 ms`, AI 평균 `<1 ms`다.
60 Hz는 측정 오차를 고려한 5% gate를 적용하며 두 headed 경로가 통과했다. Browser는
34 ms 초과 frame이 없었고 Electron은 1회만 관찰되어 반복되는 GC spike 패턴은 없었다.
headless Chromium은 이 환경에서 software WebGL이라 FPS 판정 대상에서 제외하고 CPU
timing과 기능 gate만 사용한다.

### Object pool 감사

- particle/impact는 기존 `ImpactEffects`의 16개 고정 Sprite pool을 계속 재사용한다.
- 1,000 projectile stress marker는 `ProjectileStressView`가 필요한 수만 최초 할당하고
  이후 `visible`/position만 바꾼다. 실제 projectile combat은 승인 이후 범위다.
- dash afterimage도 5개 Sprite ring을 재사용한다.
- hitbox는 actor당 최대 1개, damage event는 적중 시에만 생기며 immutable snapshot/event
  계약과 충돌하므로 이번 slice에서는 pool을 적용하지 않았다.
- renderer performance metrics object는 매 frame 새로 만들지 않고 한 객체를 갱신한다.
- 위 상태에서 Browser는 frame spike 0회, Electron은 고립된 1회뿐이라 반복 spike가 없다.
  추가 pooling은 profiler 근거가 생길 때 적용한다.

## 알려진 제한

- arena 1개, player/enemy 각 1기, 공중 콤보 1경로만 포함한다.
- projectile weapon, loadout, story/VN, save/load, installer와 상점 연동은 승인 이후다.
- Browser production의 relative asset base와 Electron `file://`를 함께 지원하기 위해
  개발 scenario는 기존 `/dev/battle?scenario=...` 외에
  `/?devScenario=...` root query도 제공한다.
- Gate G의 실제 화면 감각은 2026-08-21 사용자가 직접 확인하고 승인했다. 다음 콘텐츠
  단계 확장은 별도 승인 범위다.

## SHA-256

```text
d06978821b8c00c242a60be77994a9a87c8827d3669029a58c3304308d314351  browser-1280x800-intro.png
d62023e5edca9cd5af2b5a7121040f0f65a632fd9a0681684dffbce6981c0b3c  browser-1920x1080-intro.png
cb4f737a7c52b26a207e6cac53416354a534467a74d6c305e0f1f9c5d9680558  browser-reduced-motion-1280x800.png
1348defca364377f3d7015c3e49f8160aa63ebac8a2c7535132c752726b4c1e5  electron-production.png
3f8734f9033b1468641f0384f8be0a6f4ade434b4bb82f2bb754825b664ae40f  gamepad-core-combo-1280x800.png
1bd28aaa67871823473428d7efba8ec5b49c343e84bddebe5f9092413a6e98c7  keyboard-core-combo-1280x800.png
f78700485b67379d5891082e1fea496aba652b8054028a985dd0a22247205b04  keyboard-victory-1280x800.png
71f0373d7a64c9d16c9240c868e29b5fd8df9739723d6b033febf3c7ac1b36cf  release-smoke.json
```
