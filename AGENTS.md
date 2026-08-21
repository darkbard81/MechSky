# AGENTS.md

MechSky는 Baldr Sky형 2.5D 전투를 만드는 프로젝트다. 전투 로직은 고정 60 Hz
TypeScript simulation이 전부 소유하고, PixiJS는 표현만, DOM은 애플리케이션 UI만,
Electron은 OS 셸과 제한된 IPC만 담당한다.

## 문서 우선순위

작업 전에 이 순서로 읽는다. 충돌하면 위쪽이 이긴다.

1. [`documents/baldr_sky_architecture.md`](documents/baldr_sky_architecture.md) — 아키텍처 헌법.
   본문은 임의로 바꾸지 않는다. 확정된 변경은 문서 끝 **부칙(개정 기록)**에 한 줄씩 쌓고,
   본문과 부칙이 충돌하면 부칙이 우선한다. 새 결정으로 본문이 어긋나면 본문을 고치지 말고
   부칙 항목을 추가한다.
2. [`documents/RoadMap.md`](documents/RoadMap.md) — 수직 슬라이스 실행 계획, milestone 정의, 완료 조건, 증거 목록.
3. [`assets/README.md`](assets/README.md) — asset pipeline 재현 명령과 QC 계약.
4. [`README.md`](README.md) — 개발환경 사용법.

현재 상태: **M0·M1·M2·M3·M4·M5·M6·M7 완료.**

## 명령어

```bash
npm run dev            # Vite 개발 서버 (http://127.0.0.1:5173)
npm run dev:electron   # Electron 셸과 함께 실행
npm run check          # lint → typecheck → vitest → Playwright browser gate
npm run build          # check + web/Electron build + production release gate
npm run demo:m1        # CDP 기반 M1 입력 재현 시나리오 (증거 캡처용)
npm run demo:m6        # Playwright 기반 M6 dev URL/replay/screenshot gate
npm run demo:m5        # CDP 기반 M5 승리/패배 full-run 재현
npm run demo:m7        # headed Browser + production Electron M7 증거 재생성
```

`npm run check`가 통과하지 않은 변경은 완료가 아니다.

## 절대 규칙

아키텍처 불변식이다. milestone 속도를 위해 임시로 깨지 않는다.

1. `src/sim`은 PixiJS, DOM, Electron, Node를 모른다. ESLint가 강제하므로 규칙을 우회하지 말고 코드를 옮긴다.
2. simulation은 고정 60 Hz이고, 공격 시간은 초가 아니라 **frame(tick)**으로 표현한다.
3. renderer는 `SimulationSnapshot`과 `SimEvent`만 소비한다. Pixi 객체에 `hp`, `velocity`, `attackState`를 넣지 않는다.
4. sprite 위치, HP, action 상태의 원본은 항상 simulation이다. renderer는 파생값만 가진다.
5. 실제 전투 위치는 **그림자의 `(x, y)`**이고, sprite만 `elevation`만큼 위로 그린다. actor 정렬 키도 ground Y다 (`actorGroundSortKey`).
6. movement collision(원 vs 경계/캐릭터)과 combat collision(hitbox vs hurtbox)을 절대 합치지 않는다.
7. player와 AI 모두 `CommandIntent`만 사용한다. AI가 `enemy.attack()`처럼 직접 호출하지 않는다.
8. hit-stop은 world pause가 아니라 actor별 action clock 정지로 구현한다.
9. 모든 randomness는 seeded PRNG를 거친다. `src/sim`에서 `Math.random`, `Date.now`,
   `performance`, `Date`는 ESLint가 차단한다. simulation은 tick으로만 시간을 센다.
10. asset은 `core`, `battle-common`, `vertical-slice` bundle 단위로 로드하고 첫 표시 전에 GPU prewarm한다.
11. Pixi `AnimatedSprite`의 독립 시간으로 전투 동작을 진행하지 않는다. simulation의 tick/`actionFrame`이 표시할 texture frame을 결정한다.
12. 범용 physics를 만들지 않는다. 경사면, ragdoll, joint, rigid body, CCD 엔진은 범위 밖이다.
13. Pixi ticker를 자동 시작하지 않는다. `GameApp`이 `FixedStepClock`으로 step한 뒤 명시적으로 `render()`한다.
14. `sortableChildren`은 `actors` layer에만 켠다. projectile을 매 프레임 z-sort하지 않는다.

## 디렉터리 지도

```text
src/app/        수명주기와 수동 frame loop (game-app.ts)
src/sim/        renderer/플랫폼 독립 simulation
  world/        world.ts, entity.ts, battle-recipe.ts, fixed-step-clock.ts
  input/        CommandIntent 타입 (장치 코드 아님)
  math/         vector2.ts
src/input/      keyboard/gamepad 장치 → CommandIntent 어댑터
src/content/    로직 없는 TS 데이터 모듈 (arena/actor/attack 정의)
src/render/     PixiJS 표현 계층 (pixi-renderer, battle-scene, actors/, camera/, assets/)
src/ui/         Vanilla DOM UI (hud/)
src/platform/   browser/electron 어댑터
electron/       main process + sandbox preload
tests/sim/      PixiJS 없이 도는 simulation 테스트
tests/render/   순수 표현 로직과 asset 계약 테스트
public/assets/  런타임 에셋과 bundle manifest
assets/         imagegen 원본, pipeline 메타데이터, QC 결과
documents/      아키텍처, 로드맵, milestone 증거
```

새 시스템은 로드맵 §8의 배치를 따른다: 전투 시스템은 `src/sim/combat/`, AI는
`src/sim/ai/`, replay는 `src/sim/replay/`, debug overlay는 `src/render/debug/`.

## 코드 스타일

기존 코드와 같은 결로 쓴다. 관찰되는 규칙:

- 2 스페이스, 큰따옴표, 세미콜론, LF, 파일명 kebab-case.
- named export만 사용한다. default export 없음.
- 타입 전용 import는 `import type`을 쓴다 (`verbatimModuleSyntax`).
- 공개 인터페이스 필드는 `readonly`, snapshot은 `Object.freeze`로 잠근다.
- `noUncheckedIndexedAccess`가 켜져 있다. 배열/레코드 인덱스 접근 후 `undefined`를 반드시 처리한다.
- `any` 금지. 외부 경계는 `unknown`으로 받고 좁힌다 (`catch (error: unknown)`).
- 상수는 모듈 상단 `SCREAMING_SNAKE`, 큰 숫자는 `1_050`처럼 구분자를 쓴다.
- 잘못된 데이터는 조용히 보정하지 말고 구체적 메시지와 함께 `RangeError`/`Error`를 던진다.
- 전투 콘텐츠는 `as const satisfies AttackDefinition` 형태의 데이터 모듈로 쓴다.
  `src/content`에 함수, 분기, 상태를 넣지 않는다. JSON loader나 parse 계층도 두지 않는다.
- 사용자에게 보이는 문자열은 한국어, 식별자·주석·Pixi `label`은 영어다.
- 주석은 드물게, "왜"만 적는다. 코드가 설명하는 내용을 반복하지 않는다.
- hot path에서 불필요한 할당, `filter`/`map` 임시 배열, closure 생성을 피한다.

## 테스트 규율

- simulation 테스트는 PixiJS와 브라우저 없이 돈다. 새 전투 규칙은 tick 단위로 assert한다
  (startup/active/recovery, cancel window, hit-stop, launch, landing).
- render 테스트는 Pixi를 띄우지 않는 순수 로직(레이아웃, 보간, frame 주소)과
  파일 계약(PNG 크기, QC 메타데이터) 검증만 한다.
- `public/assets/manifest.json`은 `battle-asset-manifest.ts`와 동일해야 한다.
  둘 중 하나만 고치면 `tests/render/asset-manifest.test.ts`가 실패한다. 항상 같이 고친다.
- replay는 seed와 input frame을 고정해 state hash를 비교한다.
- 브라우저 테스트는 DOM assertion으로 끝내지 않고 screenshot을 남긴다.
- 성능은 profiler 측정 없이 추측으로 최적화하지 않는다.
- `window.__GAME_DEBUG__`는 dev와 계측 release-candidate 빌드에만 둔다. M7 gate가
  계측 빌드를 검사한 뒤 `npm run build`는 API가 제거된 shipping web bundle을 다시
  만들고 `npm run test:shipping`으로 부팅과 API 부재를 확인한다.

## Asset 계약

- 모든 runtime frame cell은 정확히 **256×256 px**, 비율 1:1이다. 2×2=512×512,
  2×3=768×512, 2×4=1024×512, 4×4=1024×1024.
- feet/bottom anchor는 QC로 확정된 **y=228** (`MECH_FEET_ANCHOR_Y = 228 / 256`).
- `mech.png`(1254×1254)는 플레이어 identity 원본이다. 덮어쓰거나 반복 압축하지 않는다.
- 원본은 `assets/source/`, 런타임은 `public/assets/`로 분리한다. `public/assets/`에는
  실제로 bundle이 로드하는 파일만 둔다. 교체된 asset은 삭제하지 말고 `assets/source/`로
  옮긴다. 메타데이터와 QC는 `assets/metadata/`에 남긴다.
- 새 bitmap은 전부 image model로 만든다. Codex에서는 `$imagegen`, Claude Code에서는
  `~/.claude/skills/shared/image-gen.sh`(Grok Build CLI 위임)를 쓴다. action별로
  개별 호출하고, 하나의 혼합 atlas 요청으로 묶지 않는다.
- Grok 경로는 출력이 JPEG 기반이라 chroma 단계 전에 `flatten_chroma.py`를 반드시
  거친다. 자세한 내용은 [`assets/README.md`](assets/README.md).
- 투명 출력은 flat `#FF00FF` chroma-key 배경으로 생성한 뒤 로컬에서 alpha 처리한다.
  배경에 그림자, gradient, floor, reflection을 넣지 않는다.
- Canvas, SVG, CSS, Pixi `Graphics`, PIL 도형으로 최종 sprite를 대체하지 않는다.
  그 도구들은 debug overlay와 layout guide 전용이다.
- 기존 asset을 승인 없이 덮어쓰지 않고 `-v2`, `-v3`로 보존한다.
- frame edge touch, paste clamp, anchor drift는 runtime offset으로 숨기지 말고
  원본 sheet를 다시 처리하거나 재생성한다.
- 사용한 prompt와 처리 명령은 `assets/README.md`와 `prompt-used.txt`에 기록한다.

## Milestone과 증거

- milestone은 코드 완료가 아니라 **화면 증거 + 자동 검증**을 모두 만족해야 닫는다.
- 증거는 `documents/evidence/<milestone>/`에 넣고 README에 캡처 조건, 확인 사항,
  체크섬을 적은 뒤 `documents/RoadMap.md`의 완료 기록에서 링크한다.
- 실제 가시 완료를 주장할 때는 브라우저 또는 Electron 화면을 직접 확인한다.
  자동 검사 통과만으로 완료라고 보고하지 않는다.
- 승인되지 않은 시각 문제를 다음 milestone으로 누적하지 않는다. 특히 sprite
  scale/anchor 문제를 runtime offset으로 숨기지 않는다.

## 완료로 인정하지 않는 상태

로드맵 §11의 요약이다. 하나라도 해당하면 끝난 게 아니다.

- debug 도형만 있고 `mech.png` 기반 sprite가 보이지 않음
- 콘솔 명령으로만 콤보를 실행할 수 있음
- 공격 animation과 hitbox frame이 어긋남
- 공중에 떴는데 그림자가 sprite를 따라 올라감
- 결과 화면이나 재시작 경로가 없음
- 같은 replay가 매번 다른 결과를 냄
- 첫 공격/첫 FX에서 눈에 띄는 texture upload hitch가 발생함
- 256×256 frame에서 기체가 잘리거나 action마다 scale이 달라짐
- Steam Deck 1280×800에서 HUD가 겹침
