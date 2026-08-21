# M8 완료 문서 — SR/SD/LR/ND × ABC 12슬롯과 콤보 슬롯 선택 코어

- 대상 이슈: [#1 M8: Baldr식 SR/SD/LR/ND × ABC 12슬롯 + 콤보 슬롯 선택 코어](https://github.com/CodeScarlett/MechSky/issues/1)
- 선행 서브 이슈: [#2 M8.1: Search Target + SR/SD/LR/ND Preferred Context Resolver](https://github.com/CodeScarlett/MechSky/issues/2) — #1의 selector가 소비할 계약이라 같은 변경에 포함했다.
- 기준 커밋: `daadb2b` (M7 승인 빌드)
- 작성일: 2026-08-21
- 자동 검증: `npm run build` 통과 (`check`의 29 test file / 181 test와 Playwright gate,
  production Browser/Electron release gate, clean shipping smoke 포함)
- 미완: **브라우저/Electron 실행 화면 확인은 사용자가 수행한다.** 화면 증거가 남기 전까지 M8은 닫히지 않는다.

---

## 1. 무엇이 바뀌었나

한 문장으로: **공격 버튼이 콤보 체인을 직접 가리키지 않고, 12개의 장착 위치를 거쳐 무기를 고른다.**

```text
장치 입력 (Z/X/C, Shift)
  → CommandIntent { type: "attack", button: "A" | "B" | "C" }
  → resolveCombatTarget()          누구를 기준으로 거리를 재는가
  → resolvePreferredAttackContext() 이 입력은 SR/SD/LR/ND 중 어디서 시작하는가
  → BufferedAttackRequest           그 컨텍스트를 눌린 시점 값으로 고정
  → selectLoadoutWeapon()           SR→SD→LR→ND 순환에서 첫 사용 가능 슬롯
  → WeaponDefinition.entryChains    지상/공중에 따라 진입할 ComboChain
  → 기존 AttackTimeline / canCancelInto()
```

마지막 줄이 핵심이다. loadout selector는 **후보를 지명할 뿐** 공격 허가를 내리지 않는다. 최종 허가는 M2부터 있던 `canCancelInto()`와 AttackTag graph가 그대로 갖는다.

## 2. 두 종류의 우선순위를 합치지 않았다

이슈가 가장 강하게 경고한 부분이라 코드에서도 물리적으로 분리했다.

| | 규칙 | 소유 파일 |
|---|---|---|
| A. preferred context | 방향 입력 → ND, 아니면 D held/active → SD, 아니면 거리 → SR/LR | `src/sim/combat/attack-context.ts` |
| B. same-button cycle | SR → SD → LR → ND → SR (wrap 1회) | `src/sim/combat/loadout.ts` |

A는 **어디서 시작할지**만 정하고, B는 **거기서부터 어디로 갈지**만 정한다. `resolvePreferredAttackContext()`는 used mask도 `WeaponDefinition`도 받지 않고 반환하지 않는다 — `tests/combat/attack-context.test.ts`가 이 경계를 고정한다.

## 3. 새 simulation 모듈

| 파일 | 책임 |
|---|---|
| `src/sim/combat/attack-context.ts` | `AttackContext`, `ATTACK_CONTEXT_CYCLE`, `BufferedAttackRequest`, `resolvePreferredAttackContext()` |
| `src/sim/combat/combat-target.ts` | `resolveCombatTarget()`, `combatTargetDistance()` |
| `src/sim/combat/weapon-definition.ts` | `WeaponDefinition`, `WeaponLibrary`, `weaponEntryChainId()`, `validateWeaponLibrary()` |
| `src/sim/combat/loadout.ts` | `ContextualLoadout`, `loadoutSlotIndex()`, `loadoutSlotLabel()`, `selectLoadoutWeapon()` |
| `src/sim/combat/combo-session.ts` | `ComboSessionState`와 그 열림/닫힘 경계 |

콘텐츠는 `src/content/weapons/mech-weapons.ts`(무기 3종)와 `mech-loadouts.ts`(플레이어/적 loadout)에 로직 없는 데이터로 들어갔다.

### Search Target과 Search Range

`resolveCombatTarget(fighter, candidates)`는 후보 배열을 받는다. 지금은 1v1이라 후보가 둘뿐이지만, 호출부가 `this.enemy` 같은 구체 필드를 보지 않으므로 이후 multi-enemy scoring이 이 함수만 바꾸면 된다.

- 유효하지 않은 target: 자기 자신, `health === 0`, world에 없는 `lockedTargetId`
- 거리는 **planar `Math.hypot(dx, dy)`만** 쓴다. elevation은 SR/LR 판정에 들어가지 않으므로 띄워 올린 적이 거리 때문에 SR에서 LR로 바뀌지 않는다.
- `combat.searchRange`는 recipe 데이터이고 `validateRecipe()`가 finite positive를 강제한다. hangar-test 값은 `180`(M7 melee reach ~130과 AI `maximumRange` 136 위)이다.
- 유효 target이 없으면 preferred는 **LR 고정**이다. 임의 SR로 만들지 않는다.

### Search Dash held 상태

기존 `DashIntent`는 rising edge만 있어서 "D를 누른 채 공격"을 simulation이 볼 수 없었다. 두 개의 intent를 만드는 대신 하나로 합쳤다.

```ts
interface SearchDashIntent {
  readonly type: "search-dash";
  readonly fighterId: EntityId;
  readonly pressed: boolean;  // dash/추격을 시작하는 rising edge
  readonly held: boolean;     // SD 컨텍스트가 읽는 지속 상태
}
```

edge만 기록해서는 replay가 "그 프레임에 버튼이 아직 눌려 있었는가"를 복원할 수 없기 때문에 둘 다 보낸다. 장치 계층은 여전히 SR/SD/LR/ND를 모른다.

`searchDashActive`는 `homingTargetId !== null || tick < dashEndExclusiveTick`이다. homing 하나로 치환하지 않았고, locomotion과도 독립이다.
한 sample 안에서 눌렸다 놓인 입력은 `pressed: true, held: false`가 되므로 preferred resolver는
방향 입력(ND) 다음 우선순위에서 `pressed || held || active`를 모두 SD로 취급한다.

## 4. 12-slot과 used mask

```text
        A         B         C
SR   slot 0    slot 1    slot 2
SD   slot 3    slot 4    slot 5
LR   slot 6    slot 7    slot 8
ND   slot 9    slot 10   slot 11
```

- 추적 단위는 weapon id가 아니라 **장착 위치**다. 같은 무기를 두 슬롯에 얹으면 한 콤보에서 두 번 쓸 수 있다.
- `selectLoadoutWeapon()`은 preferred에서 시작해 최대 4칸, wrap 1회까지만 본다. `null` 슬롯과 제외된 슬롯은 건너뛴다.
- 슬롯은 **weapon entry가 실제로 시작되는 순간**(`beginAttack`) 한 번 소비된다. 무기 내부 ComboChain의 1타→2타는 슬롯을 더 쓰지 않는다.
- 네 칸이 전부 비었거나 소비됐으면 공격 request는 시작하지 않는다.

`selectLoadoutWeapon`의 mask 인자는 `excludedSlotsMask`로 이름 지었다. 호출부가 `usedLoadoutSlotsMask | unusableSlotsMask(...)`를 넘기기 때문이다. 뒤쪽은 **현재 locomotion에 진입 체인이 없는 슬롯**이다. 공중에서 지상 전용 무장을 만나면 입력을 거절하는 대신 순환이 그 칸을 지나가게 하려는 것이다.

### 무기 내부 체인과 새 슬롯의 구분

같은 버튼을 다시 눌렀을 때 무엇을 할지의 규칙은 하나다.

```text
활성 무기의 체인에 이 버튼으로 갈 다음 단계가 남아 있는가?
├─ YES → 그 단계로 간다 (슬롯 소비 없음). cancel window가 아직 안 열렸으면 계속 버퍼에 남는다.
└─ NO  → 12-slot selector를 돌려 새 슬롯을 고른다.
```

이 순서 덕분에 M7의 `Z Z X Shift Z Z X`가 공격 단위까지 그대로 유지된다. 첫 `Z`가 SR-A(`mech-basic-combo`)를 열고, 둘째 `Z`는 체인 2타이며, `X`가 SR-B(`mech-special`)를 연다. 공중에서 다시 `Z`를 누르면 SR-A는 이미 소비됐으므로 SD-A로 넘어가고, 그 무기의 airborne entry가 `mech-air`라 공중 콤보가 이어진다.

`tests/replay/battle-replay.test.ts`의 hit 순서(`mech-ground-1 → mech-ground-2 → mech-launcher → mech-air-1 → mech-air-2 → mech-finisher`)와 최종 적 HP 420이 변경 전과 동일하다.

## 5. Combo Session

Heat는 M8 범위 밖이지만, mask reset을 임의 조건에 묶지 않기 위해 별도 상태로 뒀다.

```ts
interface ComboSessionState {
  usedLoadoutSlotsMask: number;
  active: boolean;
  idleFrames: number;
  lastEndReason: "idle" | "interrupted" | null;
}
```

M8의 임시 종료 정책:

- `interrupted` — hitstun 진입 또는 다운. 맞으면 콤보가 끝난다.
- `idle` — 공격 중도 아니고 hit-stop도 아니고 버퍼도 비어 있는 프레임이 `combat.comboSessionIdleFrames`(hangar-test 45프레임) 연속되면 닫힌다.

`advanceComboSession(session, busy, idleLimitFrames)`는 `busy` boolean 하나만 받는다. 이후 Heat milestone은 이 한 줄을 "cooling이 시작됐다"로 바꾸면 되고, 나머지 경계는 건드리지 않는다.

`hitCounter`(`comboHits`)와는 다른 개념이다. 콤보는 whiff를 지나서도 이어질 수 있고, hit counter는 같은 콤보 안에서 리셋될 수 있다.
`beginHitstun()`이 session을 즉시 닫으므로 hit-stop 0, hitstun 1인 공격이 같은 tick의
action advance에서 끝나도 사용한 slot mask가 남지 않는다.

## 6. 입력 매핑

| 행동 | 키보드 | Gamepad / Steam Deck |
|---|---|---|
| Attack A | `Z` | `A` (0) |
| Attack B | `X` | `X` (2) |
| Attack C | `C` | `Y` (3) |
| D / Search Dash | `Shift` | `B` (1) |
| Lock | `Tab` | `LB` (4) |
| Pause | `Esc` | `Menu` (9) |

held attack이 매 tick 버퍼를 다시 채우지 않는 rising-edge 규칙은 그대로다. Search Dash만 예외적으로 held 상태를 매 tick 보낸다 — 그게 SD 컨텍스트의 입력이기 때문이다.

Gamepad 이전 상태 추적은 버튼마다 boolean을 두는 대신 `previousGamepadButtons: Set<number>` 하나로 바꿨다. 버튼이 셋 늘어나는데 필드도 셋 늘리는 건 유지보수 비용만 늘린다.

## 7. Replay v3

`BATTLE_REPLAY_VERSION`을 3으로 올렸다. v1/v2 기록은 parser가 최신 shape로 변환하며, **simulation 안에는 legacy 분기가 하나도 남지 않는다.**

- `attackChains.grounded/airborne[slot]` → `legacy-<player|enemy>-<a|b>` 무기로 합성하고 **4개 context 전부에 배치**한다. 과거에는 버튼 하나가 입력 모양과 무관하게 체인 하나에 닿았으므로, 그 의미를 보존하는 배치가 이것이다. C는 null.
- `{ type: "attack", slot: 0 | 1 }` → `button: "A" | "B"`
- `{ type: "dash" }` → `{ type: "search-dash", pressed: true, held: true }` (그 프레임에 버튼이 내려가 있었다는 뜻)
- 없는 필드는 legacy 기본값으로 채운다: `searchRange`, `comboSessionIdleFrames`, `homingStopDistance`

state hash에 다음이 포함된다: buffered button/preferred context, active weapon/slot/context/button, chain id와 index, `usedLoadoutSlotsMask`, combo session active/idle 진행도/종료 사유, combat target id/거리, search dash held/active, `searchRange`.

**golden hash가 바뀌었다.** snapshot shape가 커졌으니 당연한 결과이며 전투 결과는 동일하다.

| 위치 | 이전 | 이후 |
|---|---|---|
| `tests/replay/battle-replay.test.ts` 최종 tick | `ca05d879` | `030c2d73` |
| `scripts/m6-browser-smoke.mjs` / `m7-release-smoke.mjs` tick 91 | `a395bcca` | `d12d0848` |

마이그레이션된 legacy replay는 v3 replay와 **hash가 다르다**. 합성 무기 id(`legacy-player-a`)가 정식 loadout id(`mech-basic-combo`)와 다르기 때문이다. 대신 hit 순서, 최종 HP, 최종 위치가 같다는 것을 테스트로 고정했다. 이건 결함이 아니라 계약이며, 문서화하지 않으면 나중에 버그로 오해될 값이다.

## 8. F7 Combat State

패널 문자열 생성은 `src/render/debug/debug-layers.ts`의 `formatCombatDebugLines()`로 옮겼다. PixiJS 없이 테스트할 수 있고, renderer는 표시만 하고 판정을 다시 계산하지 않는다.

```text
TICK 1  HASH e32c8d5e
P attacking/grounded  mech-ground-1 1
E idle/grounded  none 0
HITSTOP 0/0  OUTCOME ongoing
TGT 2 100/180  SD D-
BUF ----  SLOT SD-A mech-basic-combo
CHAIN mech-ground #0
USED ...#........  COMBO open
```

- `TGT <id> <거리>/<searchRange>`, `SD <D held><A ctive>`
- `BUF <버튼>/<preferred>` — 아직 실행되지 않은 요청
- `SLOT <SR-A..ND-C> <weaponId>`, `CHAIN <chainId> #<index>`
- `USED` 12칸은 SR-A부터 ND-C까지, `#`가 소비된 장착 위치
- `COMBO`는 `open` 또는 마지막 종료 사유

`TGT` 거리와 target id는 공격 context 판정을 위한 tick 전반부 계산과 별도로 이동·피격
처리가 끝난 뒤 다시 projection한다. 따라서 F7은 항상 같은 snapshot의 body 위치와 맞는다.

## 9. 테스트

새 파일 5개:

| 파일 | 범위 |
|---|---|
| `tests/combat/attack-context.test.ts` | ND > SD > SR/LR, `distance === range`는 SR, target 없음은 LR, 책임 경계 |
| `tests/combat/combat-target.test.ts` | lock 우선, 무효 lock fallback, 자기 자신 제외, elevation 무시 |
| `tests/combat/loadout.test.ts` | 이슈가 요구한 selector 매트릭스 전부 (wrap, null skip, 같은 무기 2슬롯, B/C 동일 알고리즘) |
| `tests/combat/combo-session.test.ts` | 열림/idle 종료/busy 리셋/interrupted/범위 밖 인덱스 거부 |
| `tests/combat/contextual-loadout.test.ts` | world 통합: `A A A A` 순환 3종, 컨텍스트 변경, 체인 단계가 슬롯을 안 먹음, session reset 후 재사용, buffered context 보존 |

기존 파일 갱신: replay v3 legacy 마이그레이션, F7 패널 포맷, recipe 검증(`searchRange`/`comboSessionIdleFrames`/미지의 무기/미지의 체인), 입력 매핑, 그리고 `slot: number` → `button`을 쓰는 모든 픽스처.

`A A A A` 순환 테스트는 실제 loadout이 아니라 네 컨텍스트에 서로 다른 marker 무기를 꽂은 전용 recipe로 돈다. hangar-test loadout은 네 컨텍스트가 같은 무기라 회귀 보호에는 좋지만 순환을 관측할 수 없다.

## 10. 회귀

- M7 수직 슬라이스 공격 순서, 데미지, 최종 HP 동일
- 렌더 레이트 결정성 테스트(60/120/144 Hz) 통과
- hit-stop 중 버퍼 유지 통과
- player와 AI 모두 `CommandIntent` 경계 유지 — AI는 `{ type: "attack", button: "A" }`를 보낸다
- `src/sim`에 DOM/Pixi/장치 코드 유입 없음 (ESLint 경계 통과)
- M6 브라우저 게이트: 같은 replay를 두 번 돌려 스크린샷 픽셀 동일, hash `d12d0848` 반복 일치

## 11. 범위 밖 (다음 milestone)

- projectile 구현과 swept collision
- Weapon Heat / Heat Capacity / Cooling / Overheat — 다만 combo session 종료 경계는 여기에 연결할 수 있게 남겨 뒀다
- 완성형 loadout 편집 UI
- 실제 12종 무기 콘텐츠 (지금은 3종, C열은 비어 있다)
- 지상 Search Dash movement의 완전한 Baldr 재현
- multi-enemy target scoring

## 12. 사용자가 확인할 것

`npm run check`는 통과했지만 AGENTS.md 기준으로 **화면 증거 없이는 완료가 아니다.** 다음은 사용자 몫이다.

1. 브라우저에서 `Z Z X Shift Z Z X`가 M7과 동일하게 나오는지
2. `C` 키가 아무 것도 하지 않는지 (C열이 비어 있으므로 정상)
3. `Shift`를 누른 채 `Z`를 눌렀을 때 F7의 `BUF`/`SLOT`이 `SD`로 뜨는지
4. F7 패널이 1280×800에서 다른 HUD를 가리지 않는지 — 네 줄이 늘어 패널 높이를 92 px에서
   148 px로 키웠고, F8 performance 패널을 y=218에서 y=274로 내려 겹침을 피했다
5. 확인한 화면을 `documents/evidence/m8/`에 남기고 `documents/RoadMap.md` M8 완료 기록에 링크
