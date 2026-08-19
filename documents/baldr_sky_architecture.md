좋아. 지금까지의 조건을 전부 고정하면, 나는 **“2.5D 전투 시뮬레이터 + PixiJS 표현 계층 + DOM 애플리케이션 UI + Electron 셸”**로 설계하겠다.

핵심은 **PixiJS에 게임 로직을 넣지 않는 것**이야. Baldr Sky의 전투를 3D 물리로 흉내 내지도 않고, 반대로 단순 스프라이트 게임처럼 만들지도 않는다.

## 1. 최종 구조

```text id="44qy2p"
┌─────────────────────────────────────────────────────────────┐
│                       Electron                              │
│                                                             │
│   Main Process                                              │
│   ├─ Window / Fullscreen                                    │
│   ├─ Save / Load                                            │
│   ├─ File path                                              │
│   └─ Crash / Log                                            │
│               │ preload IPC                                 │
├───────────────┼─────────────────────────────────────────────┤
│               ▼              Renderer Process               │
│                                                             │
│   ┌──────────────── GAME CORE ─────────────────────────┐    │
│   │                                                     │    │
│   │   Fixed 60Hz Combat Simulation                     │    │
│   │                                                     │    │
│   │   Input ──┐                                        │    │
│   │   AI ─────┼→ Command → Action/Combo                │    │
│   │            │       ↓                                │    │
│   │            │    Movement                            │    │
│   │            │       ↓                                │    │
│   │            │    Collision                           │    │
│   │            │       ↓                                │    │
│   │            └→ Hit Detection                         │    │
│   │                    ↓                                │    │
│   │               Hit Resolution                       │    │
│   │                    ↓                                │    │
│   │        Damage / Launch / Stun / Heat                │    │
│   └────────────────────┬────────────────────────────────┘    │
│                        │                                    │
│                   Snapshot + Events                         │
│                  ┌─────┴─────┐                              │
│                  ▼           ▼                              │
│               PixiJS        DOM                             │
│              Renderer       UI                              │
│                                                             │
│              WebGL          HUD / Menu                      │
│              Sprite         Loadout                         │
│              FX             VN                              │
│              Camera         Settings                        │
└─────────────────────────────────────────────────────────────┘
```

이 분리가 제일 중요하다. 내가 사용하는 웹게임 아키텍처 쪽에서도 simulation을 renderer와 분리하고 renderer를 상태의 원본으로 사용하지 않는 방향을 기본 원칙으로 잡고 있다. fileciteturn5file0L25-L45

---

# 2. Baldr Sky 전투는 `2D + Elevation`으로 만든다

여기서 Three.js와 Godot을 배제하는 핵심 결정이다.

월드 좌표를 완전한 XYZ로 다루지 않는다.

```ts id="ucrjgf"
interface WorldPosition {
  x: number;          // 지면 X
  y: number;          // 지면 Y
  elevation: number;  // 지면으로부터 높이
}
```

즉:

```text id="guxcn6"
                 캐릭터
                   ●
                  /|\
                   |
              elevation
                   |
                   ↓
                   ○ ← shadow

────────────────────────────── ground
             x / y
```

렌더링만:

```ts id="qcw7j2"
screenX = worldX - cameraX;
screenY = worldY - cameraY - elevation;
```

정도로 projection한다.

중요한 것은 **그림자의 위치가 실제 전투 위치**라는 것이다.

공중에 떠 있는 캐릭터도:

```text id="rhk9jf"
Combat Position = shadow position
Visual Position = shadow position - elevation
```

이다.

이렇게 하면 Baldr Sky에서 필요한 공중 콤보를 구현하면서도 3D physics는 전혀 필요 없다.

---

# 3. 충돌도 2.5D 전용으로 만든다

여기서는 물리엔진을 만들지 않는다.

기본 캐릭터 충돌체:

```ts id="5dpakm"
interface CombatBody {
  x: number;
  y: number;

  radius: number;

  elevation: number;
  bodyHeight: number;
}
```

지면에서는:

```text id="lwxt8q"
        Enemy
         ○

Player ○

Circle vs Circle
```

높이는 별도로:

```text id="9tn4fl"
Enemy

vertical interval
[ elevation
  ~
  elevation + bodyHeight ]
```

따라서 최종 충돌 조건은 단순하다.

```text id="spqs2r"
평면 충돌
    AND
높이 범위 충돌
```

예를 들어 지상 베기는:

```text id="9mx2jz"
Ground radius = 70
Elevation range = 0 ~ 80
```

공중 베기는:

```text id="h4zybt"
Ground radius = 80
Elevation range = 80 ~ 220
```

대공기는:

```text id="o9mswy"
Ground radius = 60
Elevation range = 0 ~ 300
```

이런 식이다.

이 구조라면:

```text id="hch2zi"
지상공격
대공공격
공중공격
낙하공격
Launcher
공중 추격
호밍 공격
폭발
범위 공격
```

전부 같은 collision system에서 처리할 수 있다.

---

# 4. 이동 충돌과 공격 판정을 절대 합치지 않는다

이것도 매우 중요하다.

```text id="b0sd70"
Movement Collision
──────────────────
캐릭터 ↔ 벽
캐릭터 ↔ 장애물
캐릭터 ↔ 캐릭터


Combat Collision
────────────────
Hitbox ↔ Hurtbox
Projectile ↔ Hurtbox
Explosion ↔ Hurtbox
```

완전히 다른 시스템으로 둔다.

따라서 이런 식이다.

```text id="pludgy"
CharacterBody

footprint:
    Circle

combat hurtbox:
    Capsule/Circle

Attack:
    transient Hitbox
```

Baldr Sky류에서는 **현실적인 충돌보다 전투 판정의 기분 좋은 거짓말이 훨씬 중요하다.**

그래서 공격 hitbox는 스프라이트 모양하고 정확히 일치시킬 필요도 없다.

---

# 5. 중력도 물리엔진이 아니라 전투 규칙이다

```ts id="tmh4t2"
verticalVelocity -= gravity;

elevation += verticalVelocity;

if (elevation <= 0) {
    elevation = 0;
    verticalVelocity = 0;
    grounded = true;
}
```

Launcher라면:

```ts id="qcfbuq"
target.verticalVelocity = 14;
target.grounded = false;
```

Knockback은:

```ts id="hfo6q5"
target.velocity.x += knockback.x;
target.velocity.y += knockback.y;
```

따라서:

```text id="x7vpgb"
Launcher
    ↓
Enemy Airborne
    ↓
Dash/Homing Chase
    ↓
Air Combo
    ↓
Finisher
    ↓
Downward velocity
    ↓
Ground Impact
```

가 전부 예측 가능한 코드가 된다.

**경사면, ragdoll, joint, rigid body 같은 것은 구현하지 않는다.**

그런 요구가 생기는 순간에만 architecture를 다시 검토한다.

---

# 6. 게임 루프는 PixiJS Ticker에 맡기지 않는다

PixiJS 자체 Ticker는 `requestAnimationFrame`에 기반하고 매 렌더 프레임마다 callback을 실행한다. ([pixijs.com](https://pixijs.com/8.x/guides/concepts/render-loop))

하지만 전투 simulation은 별도의 **고정 60Hz**로 돌린다.

```ts id="3zgegs"
const STEP = 1000 / 60;

function frame(now: number) {
  accumulator += now - previous;

  while (accumulator >= STEP) {
    simulation.step();
    accumulator -= STEP;
  }

  const alpha = accumulator / STEP;

  renderer.present(
    simulation.previous,
    simulation.current,
    alpha
  );

  requestAnimationFrame(frame);
}
```

즉 144Hz 모니터에서도:

```text id="32j6rm"
Simulation
60 60 60 60 60 60

Rendering
144 144 144 144 144 144 ...
```

이다.

렌더러는 이전/현재 위치를 interpolation한다.

### 전투는 Frame 기반으로 정의

공격 데이터도 초가 아니라 frame이다.

```ts id="a64xr0"
startup: 6
active: 4
recovery: 13
```

이게 Baldr Sky 계열에는 훨씬 좋다.

---

# 7. 시간은 세 종류로 분리한다

이건 나중에 hit-stop 때문에 반드시 필요해진다.

| Clock | 용도 |
|---|---|
| Real Time | DOM, 메뉴, 로딩 |
| World Tick | 고정 60Hz simulation |
| Actor Action Frame | 공격/경직/애니메이션 |

예를 들어 타격 순간:

```text id="9nxlnb"
world tick        계속 진행
input buffering   계속 진행

attacker action   4 frame freeze
victim action     6 frame freeze

camera shake      진행
particle          일부 진행
UI                진행
```

이러면 hit-stop 중 입력을 넣어도 다음 공격으로 buffer할 수 있다.

단순히 `simulation.pause()` 해버리면 이런 구현이 굉장히 어려워진다.

---

# 8. 핵심은 Attack Timeline

Baldr Sky형 게임에서 사실 **물리보다 훨씬 중요한 시스템**이다.

공격 하나를 클래스 하나로 만들면 안 된다.

이런 데이터로 만든다.

```ts id="b5tnx3"
interface AttackDefinition {
  id: string;

  duration: number;

  startup: number;
  active: number;
  recovery: number;

  damage: number;

  hitStun: number;
  hitStop: number;

  launchVelocity: number;
  knockback: number;

  events: AttackEvent[];

  cancelRules: CancelRule[];
}
```

그리고 timeline:

```text id="7yc3cf"
Frame

00 ─ Attack start
01
02 ─ forward movement
03 ─ tracking ON
04
05
06 ─ HITBOX ON
07
08
09 ─ HITBOX OFF
10 ─ cancel → melee
11 ─ cancel → dash
12
13
...
20 ─ recovery end
```

`AttackEvent`는:

```ts id="mg61gj"
type AttackEvent =
  | SpawnHitbox
  | RemoveHitbox
  | MotionImpulse
  | SetVelocity
  | StartHoming
  | StopHoming
  | SpawnProjectile
  | SetInvulnerable
  | PlayEffect
  | PlaySound;
```

가 된다.

---

# 9. 100개 무기를 클래스 100개로 만들지 않는다

Baldr Sky 공식 설명에서도 100개 이상의 무기와 무기 경험/진화, 다양한 loadout이 핵심 기능으로 소개된다. ([store.steampowered.com](https://store.steampowered.com/app/741140/Baldr_Sky/))

그래서:

```text id="8rfhm7"
Weapon
     ↓
AttackDefinition
     ↓
Attack Timeline
```

이어야 한다.

예:

```text id="swu3q2"
weapon/
   machine-gun.json
   beam-saber.json
   launcher.json
   shotgun.json
   rocket.json
```

공격 로직은 공유한다.

```text id="61rov5"
AttackSystem
```

하나가 모든 무기를 실행한다.

특수 무기라고 특별한 subclass를 만드는 것은 최후의 수단이다.

---

# 10. Cancel은 ID가 아니라 Tag 기반

이것도 100개 이상의 무기가 생기면 중요해진다.

나쁜 방식:

```text id="3eqmac"
SwordA
canCancelTo:
 SwordB
 GunA
 DashC
 SwordD
 ...
```

좋은 방식:

```ts id="qsz7qz"
tags:
  MELEE
  RANGED
  DASH
  AIR
  GROUND
  FINISHER
```

공격이:

```ts id="wb73wu"
cancelInto: [
  "MELEE",
  "DASH"
]
```

라고 정의한다.

그러면 새로운 무기가 들어와도 cancel graph를 전부 다시 작성할 필요가 없다.

---

# 11. 상태 머신은 하나짜리 거대 FSM으로 만들지 않는다

이런 걸 만들면:

```text id="q55p6q"
AIR_ATTACK_HIT_STUN_DASH_CANCEL_INVULNERABLE
```

몇 달 뒤 지옥이 된다.

세 축으로 분리한다.

```text id="6axofw"
Locomotion

Grounded
Airborne
Downed


Action

Idle
Dash
Attack
HitStun
Recovery


Flags

Invulnerable
SuperArmor
InputLocked
Homing
```

그러면:

```text id="1x1ziu"
Airborne
+
Attack
+
SuperArmor
```

같은 조합이 가능해진다.

---

# 12. 플레이어와 AI가 같은 Combat API를 사용한다

이 구조도 강하게 추천한다.

```text id="lngrho"
Keyboard/Gamepad
        ↓
CommandIntent ─────────────┐
                           ↓
                       Combat
                           ↑
AI Decision                │
        ↓                  │
CommandIntent ─────────────┘
```

예:

```ts id="gnau9m"
type CommandIntent =
  | MoveIntent
  | DashIntent
  | AttackIntent
  | LockTargetIntent;
```

AI가 직접:

```ts id="tomd4k"
enemy.attack();
```

하면 안 된다.

AI도:

```ts id="aje71c"
{
  type: "attack",
  slot: 2
}
```

를 Combat System에 보낸다.

그러면 플레이어와 적에게 **완전히 동일한 전투 규칙**이 적용된다.

난이도는 AI 쪽에서:

```text id="n4l0qw"
reaction delay
prediction
aggression
aim error
combo selection
resource management
```

만 변경하면 된다.

---

# 13. Entity 전체를 ECS로 만들 필요는 없다

여기서는 과설계를 피하고 싶다.

캐릭터는 구조체/객체 기반이 더 읽기 쉽다.

```ts id="fui4k2"
Fighter
├─ Body
├─ CombatState
├─ ActionState
├─ Equipment
├─ Status
└─ AI(optional)
```

반면 수량이 많아지는 것만 데이터 중심으로 만든다.

```text id="h8ov9t"
ProjectilePool

x[]
y[]
elevation[]

vx[]
vy[]
verticalVelocity[]

radius[]
damage[]
owner[]
target[]
active[]
```

즉:

```text id="y1witw"
Player / Enemy
→ rich objects

Projectile / Bullet
→ dense data

Particle
→ GPU oriented
```

이 **하이브리드 방식**이 가장 현실적이다.

---

# 14. Spatial Hash는 처음부터 넣는다

투사체가 많아지면:

```text id="omuney"
1000 projectiles × 50 targets
```

식으로 검사하면 안 된다.

월드를:

```text id="h73pzl"
┌──────┬──────┬──────┬──────┐
│      │ E    │      │      │
├──────┼──────┼──────┼──────┤
│ P    │ E P  │      │ E    │
├──────┼──────┼──────┼──────┤
│      │      │ E    │      │
└──────┴──────┴──────┴──────┘
```

로 나누고 자기 주변 cell만 검사한다.

```text id="a6iv15"
SpatialHash
     ↓
Candidate
     ↓
Exact Collision
     ↓
Height Check
```

이 정도면 충분하다.

Octree나 BVH 같은 3D 구조는 필요 없다.

---

# 15. 빠른 이동에는 Swept Collision만 추가

일반 공격:

```text id="tnd0wl"
Circle overlap
```

고속 Dash:

```text id="57sn9z"
Previous position
       ↓
───────────────→ Current
```

은 중간에 적을 통과할 수 있다.

따라서:

```text id="bs55hg"
segment vs circle
```

또는 swept circle만 별도로 지원한다.

이 정도면 tunneling 문제 대부분을 해결할 수 있다.

**CCD physics engine 전체를 만들 필요는 없다.**

---

# 16. PixiJS는 정말 표현만 담당

Pixi 객체에 이런 걸 넣지 않는다.

```ts id="815p16"
sprite.hp
sprite.velocity
sprite.attackState
```

금지.

Pixi 쪽은:

```text id="ua1geg"
FighterView
ProjectileView
ArenaView
EffectView
CameraView
```

밖에 모른다.

```ts id="17bl8x"
fighterView.present(snapshot);
```

정도다.

PixiJS는 현재 scene graph와 GPU renderer를 명확하게 분리하고 있으며 WebGL renderer를 production용 안정 경로로 권장한다. 그래서 나는 Electron 버전에서는 처음부터 **WebGL을 명시적으로 선택**하고 WebGPU는 나중에 별도로 테스트하겠다. ([pixijs.com](https://pixijs.com/8.x/guides/components/renderers))

---

# 17. 화면 Layer

```text id="k35kv7"
Pixi Stage

├─ Background
│
├─ ArenaGround
│
├─ GroundDecals
│
├─ Shadows
│
├─ Actors
│
├─ Projectiles
│
├─ Effects
│
├─ Foreground
│
└─ Debug
```

Actors 정도만 Y-sort한다.

투사체 2,000개를 전부 매 프레임 z-sort하는 식으로 만들지는 않는다.

PixiJS 역시 `sortableChildren/zIndex` 정렬은 대량 객체에서 비용이 생길 수 있으므로 필요한 곳에 제한하는 것을 권장한다. ([pixijs.com](https://pixijs.com/8.x/guides/components/scene-objects/container))

공중 캐릭터의 정렬 기준도 sprite의 `screenY`가 아니라:

```text id="yv4yy7"
ground Y
```

다.

안 그러면 점프할 때 다른 캐릭터 앞뒤가 뒤집힌다.

---

# 18. FX는 Simulation과 분리

타격이 발생하면 Simulation에서:

```ts id="0ftfdt"
{
  type: "HitLanded",
  position,
  attackId,
  targetId,
  severity
}
```

이런 event만 발생한다.

Renderer가 그것을 받아서:

```text id="jr5i5d"
Hit flash
Spark
Shockwave
Screen shake
Hit sound
```

를 만든다.

즉:

```text id="zbc81w"
Combat
  ↓
SimEvent
 ├→ Pixi VFX
 ├→ Camera
 ├→ Audio
 └→ DOM HUD
```

Simulation은 particle 존재 여부를 모른다.

PixiJS v8의 `ParticleContainer`는 일반 Sprite보다 가벼운 particle 전용 구조를 사용해서 대량 particle을 위한 경로를 별도로 제공한다. ([pixijs.com](https://pixijs.com/8.x/guides/migrations/v8))

---

# 19. Sprite animation도 Pixi가 시간을 결정하면 안 된다

이것도 중요하다.

공격이 현재:

```text id="684z50"
Action Frame 8
```

이라면 animator가:

```text id="w22718"
Attack Frame 8
→ texture frame 5
```

를 선택한다.

즉:

```text id="7kcpq4"
Simulation
    ↓
actionFrame
    ↓
AnimationPresenter
    ↓
Pixi texture
```

다.

AnimatedSprite가 자기 시간으로 공격 애니메이션을 진행하면:

```text id="svjvau"
Hitbox
Animation
Hitstop
```

이 서로 어긋나기 시작한다.

---

# 20. Asset은 Bundle 단위

예:

```text id="lqs14o"
assets/

manifest.json

characters/
  player/
  enemy-a/
  enemy-b/

weapons/

fx/

arenas/

ui/

audio/
```

실제 로딩은:

```text id="ht88rv"
core
battle-common
player-X
enemy-set-A
arena-X
```

같은 bundle이다.

PixiJS 현재 Assets 시스템도 manifest/bundle 기반의 비동기·캐시 로딩을 제공하고, 큰 프로젝트에는 manifest/bundle 사용을 권장한다. ([pixijs.com](https://pixijs.com/8.x/guides/components/assets))

전투 직전에 해당 bundle을 GPU까지 prewarm한다.

그래야 첫 공격할 때:

```text id="jk17b9"
decode
→ texture upload
→ frame drop
```

이 생기는 걸 막을 수 있다. PixiJS 문서도 이미지가 로드된 뒤 GPU upload 과정에서 첫 사용 시 stall이 발생할 수 있어 prepare 단계를 제공한다. ([pixijs.com](https://pixijs.com/8.x/guides/components/textures))

---

# 21. DOM은 HUD뿐 아니라 게임 전체 Shell

나는 React를 넣지 않겠다.

```text id="1qlrl8"
DOM

├─ Boot Screen
├─ Title
├─ VN / Scenario
├─ Battle HUD
├─ Pause
├─ Loadout
├─ Weapon Tree
├─ Result
├─ Settings
└─ Debug Tools
```

전투 세계만 PixiJS다.

특히 Baldr Sky는 전투 외의 loadout, progression, scenario/VN 비중도 상당하기 때문에 이 구조가 매우 잘 맞는다. 공식 Steam 설명에도 무기 성장/로드아웃, UI 플러그인, scenario chart 같은 전투 외 시스템이 명시돼 있다. ([store.steampowered.com](https://store.steampowered.com/app/741140/Baldr_Sky/))

DOM은 simulation object를 직접 참조하지 않고:

```text id="luxrs4"
BattleUIState
```

같은 작은 projection을 받는다.

그리고 HP 숫자를 매 RAF마다 DOM에 쓰지 않는다.

값이 변했을 때만 갱신한다.

---

# 22. Electron의 Node.js는 게임에 들어오지 않는다

이 부분은 지금 아키텍처에서 상당히 중요하다.

실제 구조는 엄밀히 말하면:

```text id="wxu3te"
Game

TypeScript
PixiJS
DOM
Browser APIs
```

이고,

Node.js는:

```text id="2b6n50"
Electron Main
```

에만 존재시킨다.

Electron 공식 구조에서도 main process가 앱 lifecycle/BrowserWindow를 담당하고 renderer는 웹 페이지 실행 환경이다. ([electronjs.org](https://www.electronjs.org/docs/latest/tutorial/process-model))

따라서:

```text id="idmw0f"
electron/
  main.ts
  preload.ts

src/
  ...
```

main은:

```text id="5hjggh"
save
load
window
fullscreen
quit
logs
```

정도만 한다.

Renderer에서는:

```ts id="m5a3ac"
platform.saveGame(data);
```

라고만 호출한다.

개발 중 브라우저에서는:

```text id="0891ny"
BrowserPlatform
```

Electron에서는:

```text id="cft9ah"
ElectronPlatform
```

을 inject한다.

이렇게 해야 **Electron을 실행하지 않고 Vite 브라우저만으로 게임을 완전히 테스트할 수 있다.**

---

# 23. Replay 시스템은 처음부터 만든다

이 프로젝트에서는 이게 단순 기능이 아니라 **개발 인프라**가 될 거야.

게임 시작 상태:

```ts id="vpt618"
BattleRecipe {
  arena
  player
  enemies
  loadout
  difficulty
  randomSeed
}
```

그리고 매 tick:

```text id="1izf94"
InputFrame
```

만 기록한다.

```text id="zj2edu"
Initial state
+
Random seed
+
Input frames
         ↓
      Replay
```

`Math.random()`은 금지하고 seeded PRNG를 쓴다.

그러면 내가 버그를 발견했을 때:

```text id="mpo9rh"
combo-air-017.replay
```

하나만 있으면 같은 상황을 계속 재현할 수 있다.

---

# 24. 이게 SSH 개발에서 특히 강력하다

테스트 경로를 세 단계로 둔다.

```text id="29l4gc"
Pure Simulation Tests
        ↓
Browser Integration Test
        ↓
Visual Replay Test
```

Simulation은 PixiJS조차 필요 없다.

```text id="g8ypss"
npm test

collision
combo
cancel
damage
launch
AI
projectile
```

브라우저 테스트에서는:

```text id="lgb0v8"
Vite
 ↓
Chromium
 ↓
Replay
 ↓
Screenshot
```

이 가능하다.

현재 브라우저 게임용 플레이테스트 지침에서도 Canvas/WebGL 게임은 DOM assertion만으로 부족하기 때문에 screenshot 검증을 중요한 절차로 두고 있다. fileciteturn6file0L14-L30

이 점이 Godot보다 지금 방식에 훨씬 잘 맞는다.

---

# 25. Dev Battle을 정식 기능처럼 만든다

예:

```text id="vx0d0k"
/dev/battle?scenario=launcher-test

/dev/battle?scenario=1000-projectiles

/dev/battle?scenario=air-combo

/dev/battle?scenario=wall-collision
```

그리고 개발 빌드에:

```ts id="odinie"
window.__GAME_DEBUG__
```

를 둔다.

예:

```ts id="85vukn"
game.loadScenario("air-combo");

game.step(1);

game.step(60);

game.spawnEnemy(...);

game.setPlayerHP(1);

game.toggleHitboxes();

game.dumpState();
```

이 API가 있으면 내가 브라우저를 자동으로 조작하기 매우 쉬워진다.

---

# 26. Debug renderer는 반드시 처음부터

```text id="0p117y"
[Fighter]
HP 420
AIRBORNE
ATTACK:SWORD_03
FRAME:08
CANCEL:MELEE,DASH

      hitbox
    ┌─────────┐
    │         │
 ●──┼─────────┼──→ velocity
    │         │
    └─────────┘

elevation = 122
```

보여줄 수 있어야 한다.

Toggle:

```text id="5fc0hh"
F1 Collision
F2 Hitbox
F3 AI
F4 Velocity
F5 Spatial Hash
F6 Performance
F7 Combat State
```

같은 식.

이게 있으면 “왜 안 맞았지?”를 코드만 보고 추측할 필요가 없다.

---

# 27. 권장 디렉터리

```text id="9uzdtf"
src/
│
├─ app/
│   ├─ game-app.ts
│   ├─ game-flow.ts
│   └─ screen-router.ts
│
├─ sim/
│   ├─ world/
│   │   ├─ world.ts
│   │   ├─ entity.ts
│   │   └─ spatial-hash.ts
│   │
│   ├─ movement/
│   ├─ collision/
│   ├─ combat/
│   │   ├─ attack-system.ts
│   │   ├─ hit-system.ts
│   │   ├─ damage-system.ts
│   │   ├─ cancel-system.ts
│   │   ├─ combo-system.ts
│   │   └─ hitstop-system.ts
│   │
│   ├─ projectile/
│   ├─ status/
│   ├─ ai/
│   ├─ input/
│   └─ replay/
│
├─ content/
│   ├─ actors/
│   ├─ attacks/
│   ├─ weapons/
│   ├─ enemies/
│   └─ arenas/
│
├─ render/
│   ├─ pixi-renderer.ts
│   ├─ camera/
│   ├─ actors/
│   ├─ projectiles/
│   ├─ effects/
│   ├─ animation/
│   └─ debug/
│
├─ ui/
│   ├─ hud/
│   ├─ loadout/
│   ├─ scenario/
│   ├─ menu/
│   └─ settings/
│
├─ audio/
│
├─ platform/
│   ├─ platform.ts
│   ├─ browser-platform.ts
│   └─ electron-platform.ts
│
└─ testing/
    ├─ scenarios/
    ├─ replays/
    └─ fixtures/

electron/
├─ main.ts
└─ preload.ts

tests/
├─ sim/
├─ combat/
├─ replay/
└─ browser/
```

그리고 아주 중요한 규칙 하나:

```text id="70e2ui"
src/sim
```

에서는 다음 import를 **lint 단계에서 금지**한다.

```text id="m5ui2t"
pixi.js
electron
document
window
HTMLElement
```

Simulation이 정말 독립적으로 남게 하는 것이다.

---

# 28. Performance 구조

PixiJS 쪽에서도 object pooling과 명시적 GPU resource 정리는 성능 관리 방법으로 권장한다. ([pixijs.com](https://pixijs.com/8.x/guides/concepts/garbage-collection))

그래서 hot path에서는:

```text id="1ukf4x"
new
Array.filter
Array.map
temporary object
closure creation
```

을 최대한 피한다.

특히:

```text id="pyrfqp"
Projectile
Hitbox
DamageEvent
Particle
```

은 pool화한다.

반면 처음부터 모든 것을 TypedArray ECS로 만드는 것도 하지 않는다.

**프로파일러에서 병목이 확인된 시스템만 데이터 중심화한다.**

---

# 29. 내가 잡을 성능 목표

이건 라이브러리의 보장치가 아니라 **우리 프로젝트 내부 acceptance budget**으로 잡겠다.

| 부분 | 목표 |
|---|---:|
| Simulation | 평균 < 3ms |
| Collision + Hit | < 1.5ms |
| AI | < 1ms |
| DOM update | 평상시 거의 0 |
| Render CPU | 충분한 60fps headroom |
| GC spike | 전투 중 체감 불가 |
| Simulation rate | 고정 60Hz |

그리고 실제 콘텐츠 예상 최대치보다 **2~4배 많은 stress battle**을 별도로 둔다.

`1000 projectile test` 같은 테스트를 실제 게임에 넣는 게 아니라 테스트 scene으로 계속 유지한다.

---

# 30. 처음 구현할 Vertical Slice

여기서는 순서가 중요하다.

1. **빈 Arena + Player movement**
2. **Circle world collision**
3. **Dash**
4. **한 개의 근접공격**
5. **Hitbox/Hurtbox**
6. **Hit stun + Hit stop**
7. **Launcher**
8. **Elevation/Gravity**
9. **Air attack**
10. **Homing chase**
11. **Air combo**
12. **Finisher/Knockdown**
13. **Projectile**
14. **Enemy AI**
15. **Loadout**
16. **Replay**
17. **Browser automated visual test**
18. 그 뒤에 무기/적/FX 콘텐츠 확장

여기서 **첫 목표는 게임 전체가 아니다.**

첫 완성 목표는:

```text id="ofusrs"
Enemy 접근
   ↓
근접 1타
   ↓
2타
   ↓
Launcher
   ↓
Dash Chase
   ↓
Air 1타
   ↓
Air 2타
   ↓
Finisher
   ↓
Enemy Ground Slam
```

이 한 콤보가 **“손맛이 있다”**고 느껴지는 상태다.

그것부터 만들고 architecture를 검증한다.

---

## 최종 판단

내가 이 프로젝트를 실제로 구현한다면 이렇게 고정하겠다.

```text id="c43jv7"
Electron
└─ OS Shell only

TypeScript
└─ 모든 Game Logic

60Hz deterministic-ish Simulation
├─ 2D Ground Plane
├─ Elevation
├─ Custom kinematic movement
├─ Spatial Hash
├─ Swept collision
├─ Hitbox/Hurtbox
├─ Action Timeline
├─ Cancel/Combo
└─ Replay

PixiJS v8 / WebGL
└─ Rendering only

Vanilla DOM
├─ HUD
├─ VN
├─ Loadout
├─ Menu
└─ Debug UI

Vite + Browser
└─ 실제 개발/SSH 테스트 환경
```

그리고 **Godot/Three/Phaser가 해결해 주는 범용 물리를 일부러 구현하지 않는다.** 우리가 필요한 것은 범용 physics가 아니라 **Baldr Sky 전투에 필요한 제한된 kinematic combat simulation**이기 때문이다.

이렇게 제한하면 `Node/TypeScript + PixiJS`가 약점이 아니라 오히려 장점이 된다. 전투 전체를 데이터와 코드로 통제할 수 있고, 가장 중요하게는 **SSH → Vite → Chromium → replay → screenshot → 수정** 루프를 그대로 유지할 수 있다.

이 아키텍처라면 다음 구현 단계에서는 바로 **`Simulation Core + Fighter + Elevation + AttackTimeline`의 실제 TypeScript 인터페이스와 파일 골격**부터 잡는 게 맞다.
