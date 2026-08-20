# MechSky 사용자 가시형 수직 슬라이스 로드맵

> 기준 문서: [`baldr_sky_architecture.md`](./baldr_sky_architecture.md)
>
> 기준 이미지: 프로젝트 루트의 `mech.png`
>
> 작성일: 2026-08-19
>
> 상태: M0·M1·M2·M3·M4 완료, M5 대기

## 1. 목표

이 로드맵의 목표는 시스템만 존재하는 기술 데모가 아니라, 사용자가 직접 실행하고
조작하여 다음 전투 흐름을 눈으로 확인할 수 있는 하나의 완결된 수직 슬라이스를 만드는
것이다.

```text
전투 진입
  → 적에게 접근
  → 지상 1타
  → 지상 2타
  → Launcher
  → Dash / Homing Chase
  → 공중 1타
  → 공중 2타
  → Finisher
  → 적 Ground Slam
  → 승리 또는 패배 결과
  → 즉시 재시작
```

최종 사용자는 코드, 콘솔, 디버그 명령 없이 키보드 또는 Steam Deck 컨트롤러만으로
위 흐름을 실행할 수 있어야 한다. 개발자는 같은 상황을 replay와 dev scenario로
반복 재현할 수 있어야 한다.

## 2. 현재 출발점

이미 준비된 기반은 다음과 같다.

- TypeScript, Vite, Vitest, ESLint 개발환경
- PixiJS v8 WebGL renderer와 명시적 수동 render loop
- 고정 60 Hz clock 및 이전/현재 simulation snapshot
- Pixi stage layer 골격
- Vanilla DOM 애플리케이션 UI
- Browser/Electron platform adapter
- sandboxed Electron preload와 제한된 IPC
- `src/sim`에서 PixiJS, DOM, Electron import를 금지하는 lint 경계

아직 구현되지 않은 핵심 항목은 입력, fighter 상태, 이동, 충돌, 공격 timeline, AI,
실제 sprite view, 전투 HUD, replay, 전투 결과 흐름이다.

## 3. 최종 수직 슬라이스 경험

### 3.1 플레이 시간

- 첫 실행부터 전투 시작까지 5초 이내
- 한 판은 약 60~90초
- 결과 화면에서 1회 입력으로 2초 이내 재시작

### 3.2 조작

| 행동 | 키보드 | Steam Deck / Gamepad |
|---|---|---|
| 이동 | `WASD` / 방향키 / NumPad 8방향 | 왼쪽 스틱 |
| 주 공격 / 콤보 진행 | `J` | `A` |
| Launcher / 공중 Finisher | `K` | `X` |
| Dash / 공중 추격 | `Shift` | `B` |
| 타깃 전환 | `Tab` | `LB` |
| 일시 정지 | `Esc` | `Menu` |
| 결과 후 재시작 | `Enter` | `A` |

입력은 UI 이벤트가 simulation 객체를 직접 조작하지 않고 `CommandIntent`로 변환해
고정 tick 경계에서 소비한다. 키보드와 gamepad는 동일한 intent를 생성한다.

### 3.3 사용자가 화면에서 확인해야 하는 것

- 흰색·남색·청록 발광부를 유지한 `mech.png` 기반 플레이어
- 플레이어와 명확히 구별되는 적 기체
- 지면 위치를 나타내는 그림자와 공중 높이를 나타내는 sprite 간격
- 이동, dash, 지상 공격, launcher, 공중 추격, 공중 공격, finisher
- 타격 flash, spark, slash/impact FX, hit-stop, camera shake
- 플레이어/적 HP, boost/heat, combo 수, lock-on 표시
- 공격에 맞은 적의 hit-stun, launch, knockback, down, ground slam
- 승리/패배 결과와 재시작 안내
- pause overlay와 조작 안내

## 4. 범위

### 포함

- 1개 arena
- 플레이어 1기, 적 1기
- 완결된 1개 공중 콤보 경로
- 적의 접근, 회피, 단발 공격, 피격 복구 AI
- 최소 전투 HUD와 결과 화면
- keyboard/gamepad 입력
- deterministic seeded random과 replay 1개
- 개발용 hitbox/state/performance overlay
- 브라우저와 Electron 실행

### 제외

- 스토리/VN, 세이브/로드, weapon tree, 장비 편집
- 다수 무기와 적 roster
- 온라인 플레이
- 범용 rigid-body physics, 경사면, ragdoll, joint
- 완전한 progression과 난이도 선택
- 모바일/touch UI
- 최종 배포 installer 및 상점 연동

제외 항목은 수직 슬라이스가 승인된 뒤 별도 milestone로 다룬다.

## 5. `mech.png` 및 256×256 asset 계약

### 5.1 원본 상태

- 원본 크기: 1254×1254
- 형식: RGBA PNG
- 배경: 투명
- 구도: 전신 3/4 정면
- 핵심 identity: 흰색 장갑, 남색 장갑판, 청록 visor/발광부, 각진 어깨와 긴 다리

`mech.png`는 플레이어 identity의 원본이며 덮어쓰거나 반복 압축하지 않는다. 구현 시
원본 보관 경로와 runtime export 경로를 분리한다.

```text
mech.png

assets/source/characters/player/
├─ mech-static/
└─ mech-idle-directional/
   ├─ down/
   ├─ left/
   ├─ right/
   ├─ up/
   └─ assembled/

public/assets/characters/player/
├─ mech-idle-4dir.png
├─ move.png
├─ ground-combo.png
├─ launcher.png
├─ air-combo.png
├─ finisher.png
├─ hurt.png
├─ knockdown.png
└─ mech-atlas.json
```

### 5.2 공통 규격

- 모든 전투 sprite와 FX의 기본 frame 비율은 `1:1`이다.
- 모든 runtime frame 단위는 정확히 `256×256 px`이다.
- 다중 frame sheet는 256×256 cell을 조합한다.
- 2×2 sheet는 512×512, 2×3 sheet는 768×512, 2×4 sheet는 1024×512다.
- 기준 origin은 bottom/feet anchor이고, M1 idle QC 결과 `(128, 228)`로 확정했다.
  이후 모든 지상 action sheet는 같은 anchor를 재사용한다.
- 지상 동작은 공통 feet anchor와 scale profile을 사용한다.
- 공중 동작은 body scale은 유지하되 feet alignment를 강제하지 않는다.
- texture filtering, mipmap, 해상도 정책은 모든 character sheet에서 동일하게 유지한다.
- arena는 256×256 tile/module 단위로 조립하고, UI는 DOM layout 규칙을 따른다.

### 5.3 수직 슬라이스용 action sheet 계획

모든 creative raster asset 생성과 reference 기반 변형은 `$imagegen`의 built-in image
generation을 사용한다. 이 규칙은 player/enemy action sheet, arena tile, slash/impact FX,
projectile, portrait 등 프로젝트에 새로 만드는 모든 bitmap에 적용한다.

- `mech.png`를 먼저 화면에서 확인한 뒤 identity reference로 전달한다.
- action이 서로 다르면 한 번의 혼합 atlas 요청이나 `n` variant로 만들지 않고
  `$imagegen`을 action별로 각각 호출한다.
- player body, detached FX, arena asset도 각각 별도 호출한다.
- 투명 출력은 flat solid `#FF00FF` chroma-key 배경으로 생성한 뒤 로컬에서 alpha로
  제거한다. 배경에는 그림자, gradient, floor, reflection을 넣지 않는다.
- 생성 직후의 raw output은 보존하고, 선택한 project-bound 결과는 반드시 workspace의
  source asset 경로로 복사한다. `$CODEX_HOME/generated_images`에만 남기지 않는다.
- 기존 asset을 명시적 승인 없이 덮어쓰지 않고 `-v2`, `-v3` 형태로 보존한다.
- 생성에 사용한 prompt와 reference 역할을 action별로 기록한다.
- `generate2dsprite`와 Python/Pillow 도구는 chroma 제거, 256×256 frame 분리,
  alignment, scale profile, atlas 조립, QC에만 사용한다.
- Canvas, SVG, CSS, Pixi `Graphics`, PIL 도형으로 최종 creative sprite를 대체하지
  않는다. 해당 도구는 debug overlay와 layout guide에만 사용할 수 있다.

| Asset | Frame 계획 | Runtime sheet | 비고 |
|---|---:|---:|---|
| Static/neutral | 1 | 256×256 | M0 첫 화면. M1에서 directional idle이 대체, 원본만 보관 |
| Directional idle | 방향별 4, 각 2×2 | 4×4, 1024×1024 | down/left/right/up, 200 ms |
| Move | 6, 2×3 | 768×512 | 지면 anchor 고정 |
| Ground combo | 8, 2×4 | 1024×512 | 1타와 2타가 이어지는 한 sequence |
| Launcher | 6, 2×3 | 768×512 | 상승 방향 동작, body-only |
| Air combo | 6, 2×3 | 768×512 | 공중 1타와 2타 sequence |
| Finisher | 6, 2×3 | 768×512 | 하강/내리찍기 body 동작 |
| Hurt | 4, 2×2 | 512×512 | 지상 피격 |
| Knockdown | 6, 2×3 | 768×512 | 낙하와 지면 충돌 |
| Slash/impact FX | 각 4, 2×2 | 각 512×512 | body sheet와 분리 |

M1에서는 `$imagegen`에서 `mech.png`를 identity reference로 사용해 정면·좌·우·후면
idle 원본을 방향별 2×2로 생성하고, QC 후 4×4 runtime sheet로 조립해 static sprite를
교체했다. 이동·대시 중에는 방향별 neutral frame을, 정지 중에는 simulation tick 기반
4-frame loop를 사용한다. 이후 action sheet도 같은 identity와 256×256 cell 계약을
이어간다.

Action sheet 제작 시 다음을 지킨다.

- action별 multi-row grid를 따로 만들고 QC 후 runtime atlas로 조립한다.
- body sheet에 큰 slash arc, spark, projectile, dust를 합치지 않는다.
- grounded sheet는 `align=feet`, `shared_scale`, `scale_strategy=fit`,
  `component_mode=largest`, `fit_scale=0.78`을 기본으로 한다. M1 idle QC에서
  `preserve`는 방향별 실루엣 면적 차이 때문에 body scale이 흔들려서 폐기했다.
- accepted front idle sheet가 공통 character scale profile
  (`assets/source/characters/player/mech-idle-directional/mech-idle-scale-profile.json`)을
  만들고, 이후 sheet는 이 profile을 재사용한다.
- frame edge touch, paste clamp, anchor drift가 있으면 runtime에서 보정하지 않고
  다시 처리하거나 원본 sheet를 재생성한다.
- Pixi `AnimatedSprite`의 독립 시간으로 전투 동작을 진행하지 않는다. simulation의
  `actionFrame`이 표시할 texture frame을 결정한다.

### 5.4 적 기체 처리

수직 슬라이스에서는 동일한 animation frame을 재사용하되 enemy 전용 palette/tint와
outline을 사용한다.

- 플레이어: white/navy/cyan
- 적: charcoal/dark red/orange
- HP bar, lock marker, shadow 색도 별도 구분
- 최종 콘텐츠 확장 단계에서는 별도 enemy 원본으로 교체

이 방식은 animation 검증 범위를 줄이면서도 사용자가 두 기체를 즉시 구분하게 한다.

## 6. 고정 아키텍처 규칙

다음 규칙은 milestone 속도를 위해 임시로 깨지 않는다.

1. `src/sim`은 PixiJS, DOM, Electron을 모른다.
2. simulation은 고정 60 Hz이고 공격 시간은 frame으로 표현한다.
3. Pixi renderer는 snapshot과 `SimEvent`만 소비한다.
4. sprite 위치, HP, action 상태를 renderer가 원본으로 소유하지 않는다.
5. 실제 전투 위치는 그림자의 `(x, y)`이고 sprite는 `elevation`만큼 위에 그린다.
6. movement collision과 hitbox/hurtbox collision을 분리한다.
7. player와 AI 모두 `CommandIntent`를 사용한다.
8. hit-stop은 world 전체 pause가 아니라 actor action clock 정지로 구현한다.
9. 모든 randomness는 seeded PRNG를 거친다.
10. 자산은 `core`, `battle-common`, `vertical-slice` bundle로 로드한다.

## 7. Milestone 로드맵

각 milestone은 코드 완료가 아니라 화면 증거와 자동 검증을 모두 만족해야 닫는다.

### M0. Asset intake와 첫 전투 화면

목표: `mech.png`가 실제 Pixi scene에 표시되는 첫 검토 가능 화면을 만든다.

구현:

- 원본/가공 asset 경로 분리
- `mech.png`를 투명 256×256 static runtime frame으로 정규화
- Pixi `Assets.init`과 manifest/bundle loader 연결
- loading progress를 DOM boot screen에 표시
- `$imagegen`으로 만든 256×256 arena module로 hangar test floor 구성
- player sprite, ground shadow, static target marker 배치
- camera와 1024×768 기준 viewport 확정
- texture를 첫 표시 전에 GPU prewarm

사용자 가시 완료 조건:

- `npm run dev` 후 투명 배경의 mech 전신이 잘리지 않고 표시된다.
- 발밑 그림자와 mech의 발 위치가 자연스럽게 맞는다.
- resize 후에도 기체가 찌그러지거나 흐려지지 않는다.
- 로딩 실패 시 빈 화면 대신 asset 이름이 포함된 오류 UI가 나온다.

검증 증거:

- 1024×768 browser screenshot
- 1920×1080 browser screenshot
- asset manifest 단위 테스트

완료 기록 (2026-08-19):

- [`1024×768 기준 화면`](./evidence/m0/browser-1024x768.png)
- [`1920×1080 resize 화면`](./evidence/m0/browser-1920x1080.png)
- [`asset 누락 오류 화면`](./evidence/m0/browser-asset-error.png)
- [`production file:// 화면`](./evidence/m0/production-file-1024x768.png)
- `npm run build` 및 manifest/layout 포함 8개 테스트 통과

### M1. 이동 가능한 2.5D arena

목표: 사용자가 기체를 직접 움직이며 2.5D 좌표계를 이해할 수 있게 한다.

구현:

- `BattleRecipe`, `Fighter`, `Body`, `SimulationSnapshot` 최소 모델
- keyboard/gamepad → `MoveIntent`, `DashIntent`, `LockTargetIntent`
- 지면 `(x, y)` 이동과 arena circle/bounds 충돌
- acceleration, deceleration, facing, dash cooldown
- 이전/현재 snapshot interpolation
- ground Y 기준 actor sort
- target lock marker와 완만한 camera follow
- player 위치/속도/상태를 표시하는 개발 HUD

사용자 가시 완료 조건:

- WASD와 왼쪽 스틱으로 같은 속도로 이동한다.
- diagonal 입력이 직선 이동보다 빠르지 않다.
- arena 경계를 통과할 수 없다.
- dash가 이동보다 명확히 빠르고 잔상/boost FX가 보인다.
- camera가 튀지 않고 mech를 따라간다.

검증 증거:

- 이동, dash, 경계 충돌을 담은 10초 clip
- 60/120/144 Hz render 환경에서 동일 tick 결과 단위 테스트

완료 기록 (2026-08-19):

- [`이동·dash·경계 충돌 10초 clip`](./evidence/m1/movement-dash-boundary.mp4)
- [`1초 간격 contact sheet`](./evidence/m1/contact-sheet.png)
- [`640 units/s dash 잔상 frame`](./evidence/m1/dash-afterimage.png)
- `WASD`, 방향키, NumPad 8방향, 왼쪽 스틱을 동일 `MoveIntent`로 통합
- 60/120/144 Hz에서 동일한 600번째 snapshot 및 M1 자동 테스트 통과
- [`4방향 idle runtime clip`](./evidence/sprites/mech-idle/directional-idle-runtime.mp4)
- [`방향별 runtime contact sheet`](./evidence/sprites/mech-idle/runtime-directions-contact-sheet.png)
- [`idle sprite 검증 기록`](./evidence/sprites/mech-idle/README.md)

### M2. 지상 2타와 타격 반응

목표: 공격이 “맞았다”는 사실을 화면과 조작감으로 확실하게 전달한다.

구현:

- data-driven `AttackDefinition`과 `AttackTimeline`
- startup/active/recovery frame
- tag 기반 cancel rule과 input buffer
- fighter hurtbox, transient attack hitbox
- spatial hash candidate 조회와 exact 2D+height check
- damage, hit-stun, knockback, actor별 hit-stop
- `HitLanded` event → flash, spark, sound, camera shake
- F1 collision, F2 hitbox, F4 velocity, F7 combat state overlay
- static enemy target 및 HP projection

사용자 가시 완료 조건:

- `J`를 누르면 startup 후 정해진 순간에만 타격한다.
- 1타 적중 후 허용 구간에서 다시 `J`를 누르면 2타로 이어진다.
- 너무 이르거나 늦은 입력은 규칙대로 buffer 또는 무시된다.
- miss와 hit가 flash, spark, shake, enemy reaction으로 분명히 다르다.
- 공격 중 debug overlay의 active hitbox가 실제 판정과 일치한다.

검증 증거:

- hit/miss 비교 clip
- startup/active/recovery, cancel window, 중복 hit 방지 단위 테스트

완료 기록 (2026-08-20):

- [`hit/miss 비교 10초 clip`](./evidence/m2/combat-hit-miss.mp4)
- [`1초 간격 contact sheet`](./evidence/m2/contact-sheet.png)
- [`active frame의 hitbox와 실제 판정`](./evidence/m2/active-hitbox-frame6.png)
- [`M2 검증 기록`](./evidence/m2/README.md)
- `AttackDefinition`/`AttackTimeline`, tag 기반 cancel, 9프레임 입력 buffer,
  actor별 hit-stop, spatial hash 후보 조회 + 평면·높이 판정을 구현
- 적 기체는 §5.4대로 동일 idle sheet에 enemy palette tint를 적용해 새 asset 없이 구분
- 사운드는 asset 조달 수단이 없어 M4의 최소 SFX 연결로 이월하고 event 훅만 마련
- `tests/combat/` 28개 및 전체 71개 테스트 통과

### M3. Launcher부터 Ground Slam까지

목표: 아키텍처의 핵심인 elevation 기반 공중 콤보 한 줄을 완성한다.

구현:

- `elevation`, `verticalVelocity`, gravity, grounded/airborne/downed
- height interval이 포함된 hitbox/hurtbox 판정
- launcher velocity와 airborne hit-stun
- target 방향 homing chase
- 공중 공격 2타와 air cancel
- downward finisher, ground impact, knockdown, wake-up
- 그림자는 지면 위치에 유지하고 sprite만 elevation만큼 이동
- 공중 상태 camera framing과 impact shake

사용자 가시 완료 조건:

- `J → J → K → Shift → J → J → K`로 전체 콤보가 이어진다.
- 적이 실제로 지면에서 떠오르고 그림자와 분리된다.
- 지상 공격은 충분히 높은 적을 맞히지 못한다.
- 공중 공격은 height range가 겹칠 때만 맞는다.
- finisher 후 적이 지면에 충돌하고 잠시 down 상태가 된다.
- 프레임 드롭 후에도 지면을 통과하거나 무한 공중 상태가 되지 않는다.

검증 증거:

- 전체 콤보 무편집 clip
- elevation, gravity, height overlap, landing, knockdown 단위 테스트

완료 기록 (2026-08-20):

- [`전체 공중 콤보와 Ground Slam clip`](./evidence/m3/air-combo-ground-slam.mp4)
- [`Launcher 공중 분리`](./evidence/m3/launcher-airborne.png)
- [`Homing chase`](./evidence/m3/homing-chase.png)
- [`공중 2타`](./evidence/m3/air-combo.png)
- [`Finisher Ground Slam`](./evidence/m3/ground-slam.png)
- [`M3 검증 기록`](./evidence/m3/README.md)
- 사용자가 실제 실행 화면에서 M3 가시 완료 조건을 모두 확인

- `J → J → K → Shift → J → J → K` 입력을 지상 2타, launcher, homing chase,
  공중 2타, finisher에 연결
- `verticalVelocity`, gravity, 최대 낙하 속도, grounded/airborne/downed,
  ground impact, 48-tick knockdown과 wake-up을 simulation 상태로 구현
- 지상·공중 attack chain을 슬롯별 데이터 모듈로 분리하고 모든 판정을 평면 겹침과
  높이 구간 겹침으로 유지
- 그림자는 ground `(x, y)`에 고정하고 sprite/boost trail만 elevation을 반영하며,
  공중 전투 camera framing과 ground-impact shake를 snapshot/event에서 파생
- 전체 6타 경로, 정상 landing, 지상·공중 공격의 높이 miss, render projection/camera/input,
  60/120/144 Hz 및 50 ms catch-up 결정성 테스트를 포함해 전체 80개 테스트 통과
- `npm run build`의 check, web build, Electron build 통과

### M4. `mech.png` 기반 최종 action art와 손맛

목표: static image prototype을 실제 action frame 기반 전투 표현으로 교체한다.

구현:

- `$imagegen`으로 5장의 핵심 body sheet를 action별 제작: idle, move, ground combo,
  air combo, hurt
- `$imagegen`으로 launcher, finisher, knockdown sheet를 각각 추가
- `$imagegen`으로 별도 slash, impact, boost, ground slam FX sheet 제작
- 모든 runtime frame을 256×256로 export
- 공통 scale profile과 feet/bottom anchor QC
- action frame → texture frame mapping
- player/enemy palette 구분
- hit flash, afterimage, trail, shockwave, screen shake tuning
- melee, launcher, air hit, ground slam 최소 SFX 연결
- `vertical-slice` bundle 로드 후 GPU prewarm

사용자 가시 완료 조건:

- 모든 동작에서 같은 기체 identity와 body scale이 유지된다.
- idle에서 attack으로 바뀔 때 발 위치가 순간 이동하지 않는다.
- 큰 FX 때문에 mech body가 작아지거나 cell 밖에서 잘리지 않는다.
- hit-stop 동안 pose는 멈추지만 spark와 camera feedback은 진행한다.
- 첫 공격에서도 texture upload로 인한 눈에 띄는 hitch가 없다.

검증 증거:

- action별 투명 GIF/contact sheet
- frame edge/anchor/scale QC metadata
- 최종 combo clip

완료 기록 (2026-08-20):

- [`action/FX 투명 GIF 및 자동 검증 기록`](./evidence/m4/README.md)
- `mech.png` identity reference로 move, ground combo, launcher, air combo, finisher,
  hurt, knockdown body sheet와 slash, impact, boost, ground-slam FX를 액션별 생성
- 수락한 11개 sheet의 256×256 cell, 투명 RGBA, edge/clamp/empty, 지면 anchor를
  processor metadata와 render asset test로 고정
- simulation `actionFrame` 기반 startup/active/recovery frame 선택과 hit-stop pose 정지,
  render-time FX 진행을 분리
- `vertical-slice` bundle 전체 sheet를 첫 화면 전에 GPU prewarm하고 player/enemy tint,
  afterimage, slash/impact/shockwave, camera shake, WebAudio 최소 SFX를 연결
- `npm run build`에서 lint, typecheck, 15개 test file / 91개 test, web/Electron build 통과
- 1024×768 Chromium CDP에서 전체 콤보, HP 변화, 공중 분리, ground slam, wake-up을
  재현하고 [`최종 combo clip`](./evidence/m4/final-combo.mp4)과 state timeline을 기록
- 사용자가 실제 실행 화면에서 identity/scale, feet anchor, FX 잘림, hit-stop feedback,
  첫 사용 hitch, 최소 SFX를 확인하고 모든 M4 가시 완료 조건을 승인

### M5. 적 AI, HUD, 한 판의 시작과 끝

목표: 연습용 target을 실제로 반격하는 적과 완결된 전투 흐름으로 바꾼다.

구현:

- AI decision → 동일한 `CommandIntent` API
- 접근, 사거리 유지, 단발 공격, 짧은 회피, hit recovery
- reaction delay와 aim error로 읽을 수 있는 난이도 구성
- player/enemy HP, heat/boost, combo counter, lock-on HUD
- battle intro, pause, victory, defeat, retry DOM screen
- 입력 장치에 따라 keyboard/gamepad 안내 자동 전환
- battle reset 시 Pixi view, event queue, input buffer 완전 초기화

사용자 가시 완료 조건:

- 적이 멈춰 있는 허수아비가 아니라 접근하고 반격한다.
- 적 공격에 맞으면 player HP와 pose가 함께 반응한다.
- 승패가 확정되면 simulation 입력이 잠기고 결과 화면이 나온다.
- 재시작하면 HP, 위치, combo, FX가 초기 상태로 돌아간다.
- Steam Deck에서 마우스 없이 한 판을 시작하고 끝낼 수 있다.

검증 증거:

- 승리 1회와 패배 1회 full-run clip
- battle reset과 AI intent 단위 테스트

### M6. Replay, dev scenario, 브라우저 시각 검증

목표: 같은 버그와 같은 전투를 반복 재현할 수 있게 한다.

구현:

- `BattleRecipe + seed + InputFrame[]` replay 포맷
- `Math.random()` 사용 금지와 seeded PRNG
- `/dev/battle?scenario=vertical-slice`
- `/dev/battle?scenario=air-combo`
- `/dev/battle?scenario=1000-projectiles`
- `window.__GAME_DEBUG__`의 load/step/dump/toggle API
- browser smoke test와 고정 replay screenshot
- snapshot state hash 비교

사용자 가시 완료 조건:

- 저장한 replay를 실행하면 같은 tick에 같은 공격과 결과가 나온다.
- dev URL을 열면 메뉴 조작 없이 지정 장면이 즉시 시작된다.
- debug toggle이 일반 플레이 UI를 깨뜨리지 않는다.
- visual test 실패 시 비교 가능한 screenshot artifact가 남는다.

검증 증거:

- 동일 replay 2회 실행의 state hash 일치
- 1280×800 기준 screenshot
- `npm run check`에 replay/browser gate 연결

### M7. 수직 슬라이스 승인 빌드

목표: 브라우저와 Electron에서 사용자 검토가 가능한 후보 빌드를 만든다.

구현:

- 1280×800 Steam Deck와 1920×1080 desktop layout 조정
- loading, pause/resume, focus loss, fullscreen 복귀 확인
- production bundle과 Electron shell smoke test
- simulation, collision, AI timing instrumentation
- object pool 적용 대상 확인: hitbox, projectile, particle, damage event
- 접근성: focus 표시, reduced-motion 시 camera shake 감소
- 최종 조작 안내와 알려진 제한 정리

승인 기준:

- 90초 이내 한 판을 처음부터 끝까지 플레이할 수 있다.
- 핵심 공중 콤보를 keyboard와 gamepad에서 각각 실행할 수 있다.
- 1280×800에서 HUD가 arena나 결과 버튼을 가리지 않는다.
- 일반 전투에서 60 FPS를 유지하고 simulation 평균이 3 ms 미만이다.
- collision+hit 평균은 1.5 ms 미만, AI 평균은 1 ms 미만이다.
- 전투 중 반복되는 체감 GC spike가 없다.
- browser와 Electron 결과가 기능적으로 동일하다.
- `npm run check`와 `npm run build`가 통과한다.

## 8. 구현 파일 배치

```text
src/
├─ app/
│  ├─ game-app.ts
│  ├─ game-flow.ts
│  └─ screen-router.ts
├─ sim/
│  ├─ world/
│  ├─ movement/
│  ├─ collision/
│  ├─ combat/
│  │  ├─ attack-system.ts
│  │  ├─ hit-system.ts
│  │  ├─ damage-system.ts
│  │  ├─ cancel-system.ts
│  │  ├─ combo-system.ts
│  │  └─ hitstop-system.ts
│  ├─ input/          # CommandIntent 타입만
│  ├─ ai/
│  └─ replay/
├─ input/             # keyboard/gamepad 장치 → CommandIntent 어댑터
├─ content/
│  ├─ actors/
│  ├─ attacks/
│  └─ arenas/
├─ render/
│  ├─ actors/
│  ├─ animation/
│  ├─ camera/
│  ├─ effects/
│  └─ debug/
├─ ui/
│  ├─ hud/
│  ├─ menu/
│  └─ result/
└─ testing/
   ├─ scenarios/
   └─ replays/

tests/
├─ sim/
├─ combat/
├─ replay/
└─ browser/
```

Content는 system 코드와 분리하되, 파일 형식은 JSON이 아니라 **로직 없는 TypeScript
데이터 모듈**로 고정한다. `as const satisfies AttackDefinition` 형태로 선언해
컴파일 타임에 계약을 검증하고, 런타임 loader와 parse 계층을 두지 않는다.
`src/content`에는 함수, 분기, 상태를 넣지 않는다.

```text
src/content/attacks/mech-ground-combo.ts
src/content/attacks/mech-launcher.ts
src/content/attacks/mech-air-combo.ts
src/content/attacks/mech-finisher.ts
src/content/actors/player-mech.ts
src/content/actors/enemy-mech.ts
src/content/arenas/hangar-test.ts
```

M6의 replay와 dev scenario는 이 데이터 모듈을 참조하고, 직렬화가 필요한 것은
`BattleRecipe + seed + InputFrame[]`뿐이다.

아키텍처 문서 §9의 `weapon/*.json` 예시는 파일 형식이 아니라 "무기마다 클래스를
만들지 않는다"는 원칙을 뜻한다. 이 결정은
[`아키텍처 부칙 A1`](./baldr_sky_architecture.md#a1-content-파일-형식은-typescript-데이터-모듈-2026-08-20-m1-종료-시점)에
기록되어 있다.

## 9. 사용자 검토 게이트

| Gate | 시점 | 사용자에게 보여줄 것 | 승인 질문 |
|---|---|---|---|
| A | M0 완료 | 1024×768 정적 battle screenshot | mech 크기, 구도, HUD 위치가 적절한가? |
| B | M1 완료 | 이동/dash 10초 clip | 속도감과 camera가 편안한가? |
| C | M2 완료 | hit/miss 비교 clip | 타격이 명확하고 과하지 않은가? |
| D | M3 완료 | 전체 공중 콤보 clip | 높이와 추격 흐름이 읽히는가? |
| E | M4 완료 | action contact sheet와 최종 combo clip | `mech.png` identity가 유지되는가? |
| F | M5 완료 | 승리/패배 full run | 한 판의 흐름과 난이도가 이해되는가? |
| G | M7 완료 | Browser/Electron 후보 빌드 | 수직 슬라이스를 다음 콘텐츠 단계로 확장할 것인가? |

각 gate에서 승인되지 않은 시각 요소는 다음 milestone에 누적하지 않고 해당 단계에서
고친다. 특히 sprite scale/anchor 문제를 runtime offset으로 숨기지 않는다.

## 10. 테스트와 품질 게이트

### 매 변경마다

```bash
npm run lint
npm run typecheck
npm test
```

### Milestone 종료마다

```bash
npm run check
npm run build
```

추가 검증 항목:

- simulation test는 PixiJS와 browser 없이 실행
- attack frame, cancel window, hit-stop, launch, landing은 tick 단위 assertion
- replay는 seed와 input frame을 고정해 state hash 비교
- browser test는 DOM assertion만으로 끝내지 않고 screenshot을 남김
- 실제 가시 완료를 주장할 때는 browser 또는 Electron 화면을 직접 확인
- performance는 profiler 측정 없이 추측으로 최적화하지 않음

## 11. 완료로 인정하지 않는 상태

다음 중 하나라도 해당하면 수직 슬라이스는 완료가 아니다.

- debug 도형만 있고 `mech.png` 기반 sprite가 보이지 않음
- 콘솔 명령으로만 콤보를 실행할 수 있음
- 공격 animation과 hitbox frame이 어긋남
- 공중에 떠도 그림자가 sprite를 따라 올라감
- 결과 화면이나 재시작 경로가 없음
- 같은 replay가 매번 다른 결과를 냄
- 첫 공격/첫 FX에서 눈에 띄는 texture upload hitch가 발생함
- 256×256 frame에서 기체가 잘리거나 action마다 scale이 달라짐
- Steam Deck 1280×800에서 HUD가 겹침
- 자동 검사만 통과하고 실제 화면 검토가 없음

## 12. 수직 슬라이스 이후 우선순위

승인 후에는 아래 순서로 확장한다.

1. projectile 무기 1종과 swept collision
2. loadout 3-slot과 weapon data
3. 서로 다른 silhouette의 enemy 2종
4. heat/overheat와 resource management
5. 무기 경험치와 progression
6. scenario/VN shell
7. save/load
8. stress battle과 asset unload 정책 확장

첫 확장은 weapon 수를 늘리는 것이 아니라, 승인된 전투 감각과 architecture를 깨지
않고 새로운 공격 data가 추가되는지 검증하는 데 초점을 둔다.
