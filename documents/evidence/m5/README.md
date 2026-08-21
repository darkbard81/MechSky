# M5 적 AI와 완결 전투 흐름 검증 기록

## 현재 상태

M5 코드 구현, 자동 검증, 1280×800 Chromium CDP 승리/패배 full-run 및 표준
Gamepad API 기반 무마우스 패배/retry 재현을 완료했다. 사용자가 실제 실행 화면과
난이도를 승인했으며, 최종 요청인 keyboard `Z` 주 공격 / `X` Launcher·Finisher도
반영한 뒤 keyboard full-run 증거를 다시 생성했다.

## 구현 범위

- seeded `EnemyAiController`가 player와 같은 `CommandIntent`만 생성한다.
- AI는 14-frame reaction delay 뒤 접근하고, 선호 사거리 보정, 단발 공격, 근접
  공격 회피 dash, 24-frame 피격 복구를 수행한다.
- 양쪽 fighter가 같은 attack buffer, timeline, hitbox/hurtbox, damage, hit-stop,
  hitstun 경로를 사용한다.
- DOM HUD에 player/enemy HP, boost recharge, combo, lock-on을 표시한다.
- intro, pause, victory, defeat, 1-input retry overlay를 제공한다.
- 연결된 gamepad를 감지하면 안내를 왼쪽 스틱/A/X/B/LB/Menu 기준으로 전환한다.
- keyboard는 Z/X, gamepad는 A/X로 주 공격과 Launcher·Finisher를 실행한다.
- retry는 새 simulation과 같은 seed의 AI를 만들고 event queue와 입력 buffer를 비운 뒤,
  Pixi texture는 보존하면서 fighter pose, camera, shake, impact pool, afterimage와 boost
  trail을 초기화한다.

## 1280×800 브라우저 증거

- [`승리 full-run`](./victory-full-run.mp4)
- [`승리 contact sheet`](./victory-contact-sheet.png)
- [`승리 runtime timeline`](./victory-timeline.json)
- [`패배 full-run`](./defeat-full-run.mp4)
- [`패배 contact sheet`](./defeat-contact-sheet.png)
- [`패배 runtime timeline`](./defeat-timeline.json)
- [`전투 intro`](./victory-intro.png)
- [`pause overlay`](./victory-paused.png)
- [`승리 결과`](./victory-result.png)
- [`패배 결과`](./defeat-result.png)
- [`승리 후 retry reset`](./victory-retry-reset.png)
- [`패배 후 retry reset`](./defeat-retry-reset.png)
- [`gamepad intro`](./defeat-gamepad-intro.png)
- [`gamepad pause`](./defeat-gamepad-paused.png)
- [`gamepad 패배 결과`](./defeat-gamepad-result.png)
- [`gamepad retry reset`](./defeat-gamepad-retry-reset.png)
- [`gamepad runtime timeline`](./gamepad-timeline.json)

승리 run은 AI의 반격으로 player HP가 `1000 → 940`이 된 뒤 전체 공중 콤보를 두 번
연결해 enemy HP를 `900 → 420 → 0`으로 만들었다. 마지막 Finisher에서 HP가 0이 되면
새 입력을 즉시 잠그고, enemy가 ground impact/downed에 도달한 tick 503에 승리를
확정했다. 패배 run은 입력 없이 AI가 접근하고 단발 공격을 반복해 tick 1419에 player를
downed/0 HP로 만들었다.

두 run 모두 pause 중 simulation tick 불변을 검사했다. 결과 화면의 Enter 한 번으로
2초 안에 player `1000/1000`, enemy `900/900`, 초기 위치, combo 0, AI observing,
ongoing outcome으로 복귀함을 timeline에서 확인했다. 영상은 scenario 전체 동안 연속
수집한 CDP frame을 순서 변경이나 장면 제거 없이 H.264로 묶었다.

별도 gamepad run은 브라우저의 표준 `navigator.getGamepads()` 경계에 연결된 장치를
주입하고, A 버튼으로 시작, Menu 버튼으로 pause/resume, A 버튼으로 패배 후 retry를
수행했다. timeline에서 `GAMEPAD · LEFT STICK` 안내 전환, pause tick 불변, tick 1419
패배, retry tick 9의 초기 HP/위치/combo/AI 상태를 확인했다. 이는 브라우저 입력 경로의
자동 증거이며 실제 Steam Deck 조작감은 사용자 Gate F에서 확인한다.

재현 명령:

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9226 \
MECHSKY_M5_MODE=victory \
MECHSKY_CAPTURE_DIR=<temporary-frame-directory> \
MECHSKY_PROOF_DIR=documents/evidence/m5 \
MECHSKY_TIMELINE_FILE=documents/evidence/m5/victory-timeline.json \
npm run demo:m5
```

`MECHSKY_M5_MODE=defeat`로 패배 run을 재현한다.

표준 gamepad 무마우스 경로는 다음 환경 변수를 추가한다.

```bash
MECHSKY_CDP_URL=http://127.0.0.1:9226 \
MECHSKY_M5_MODE=defeat \
MECHSKY_M5_INPUT=gamepad \
MECHSKY_PROOF_DIR=documents/evidence/m5 \
MECHSKY_TIMELINE_FILE=documents/evidence/m5/gamepad-timeline.json \
npm run demo:m5
```

## 자동 검증

- baseline M4: 15 test files / 91 tests 통과
- M5 현재: 20 test files / 114 tests 통과
- AI reaction/approach/range/attack/evade/hit recovery와 동일 seed 결정성
- enemy 공격의 player HP/hitstun pose 반영과 terminal input lock
- 공중 0 HP 이후 새 입력은 잠그면서 ground impact까지 진행한 뒤 승리 확정
- intro/pause/victory/defeat/retry flow와 keyboard/gamepad flow 입력
- session reset 후 snapshot, AI seed/state, event queue 초기화
- keyboard queue reset과 연결된 gamepad 안내 자동 선택
- keyboard/gamepad 조작 안내의 전체 label mapping
- 표준 Gamepad API의 A 시작/retry, Menu pause/resume 브라우저 runtime 경로

## 사용자 Gate F 확인 결과

- [x] 적의 접근, 간격 유지, 반격과 회피가 읽힌다.
- [x] player 피격 시 HP 감소와 hurt pose가 함께 보인다.
- [x] pause 및 승리/패배 결과 화면의 흐름이 명확하다.
- [x] retry 직후 HP, 위치, combo, FX가 자연스럽게 초기화된다.
- [x] Steam Deck에서 A로 시작/retry하고 Menu로 pause/resume할 수 있다.
- [x] 한 판의 난이도와 길이가 이해 가능하다.
- [x] 사용자 요청에 따라 keyboard 공격 binding을 J/K에서 Z/X로 변경했다.

## SHA-256

```text
86ac38d4855eb915e243b01a5e93f246ef724a25e0dc20cf8445dadefbce6f01  defeat-full-run.mp4
7f9ea6c43b4bafe935a5d65b4cbbdadf862cb69b4bf9944dbcd5ed8ef8d516e4  defeat-contact-sheet.png
6ab2f3d398012b3d146c38828aef31254007b636cc6a45ea7e3edc2c07d8e114  defeat-timeline.json
ada205137052770699c93a0d6401d860694446cdf0cfd205d9b8c8c5f02e08d2  defeat-result.png
7202ac84f24fe80ced384dc55b0de821beff29f6c60afd2ff12b9a77573e6ae9  defeat-retry-reset.png
7bac2156ada16466c09430edf5215b99242e555951e5bc8f2804aca7f26ab5d8  defeat-gamepad-intro.png
530bd0788b4d71082d811a9014d3be0fcd50a68e35c1a931e98d499400acf06b  defeat-gamepad-paused.png
a4370d4e3506c1f1084aa07c667ec57e393219a239493ec15eb3807d92669d38  defeat-gamepad-result.png
3da03211f3b1830a8b5abf2106a38807a4c2924d1943f5800d691482267053f7  defeat-gamepad-retry-reset.png
8cde59d04dcaf9f757457f9ea2a71bfab17e7e3c07511f4d6895d1df197be0f4  gamepad-timeline.json
208df1f10c333907ed7a79acf2e360c83977326db4f1f68db5eb3b0c4645253a  victory-full-run.mp4
e3876da52ea3f1280f96fc6a57c7366eb8bb8b95c84dc32681ed6dbb958b80e5  victory-contact-sheet.png
d13b575a3da53ed2bfdd185256f4af200877a1942ae0bef9592b28c965c26675  victory-timeline.json
22898bf493cb3246fb8553152503f211deec1c1d42fe6a62c7084fa96285bd7a  victory-intro.png
f4e5da5519d9a34587f87a189f40cacdce0cefe9e2bb067add42b2a50dd41de9  victory-paused.png
d9b35f33ce68e04440931d61d61e8a2954efe7541c28eeb5d51c00d3613c5ab1  victory-result.png
4f82c92e58a9e202c1b1362bb4d39e3c28e70c68b71cf0cd9ebd8dc026772393  victory-retry-reset.png
```
