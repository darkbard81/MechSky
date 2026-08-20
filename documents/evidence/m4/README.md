# M4 action art 및 손맛 검증 기록

## 현재 상태

Action/FX source, runtime bundle, frame mapping, 최소 SFX, GPU prewarm, 자동 검증과
CDP 최종 combo 재현을 완료했다. 2026-08-20 사용자가 실제 실행 화면에서 모든 M4
가시 완료 조건을 확인하고 승인했다.

## 수락한 투명 animation GIF

본체:

- [`move`](./actions/move.gif)
- [`ground combo`](./actions/ground-combo.gif)
- [`launcher`](./actions/launcher.gif)
- [`air combo`](./actions/air-combo.gif)
- [`finisher`](./actions/finisher.gif)
- [`hurt`](./actions/hurt.gif)
- [`knockdown`](./actions/knockdown.gif)

FX:

- [`slash`](./fx/slash.gif)
- [`impact`](./fx/impact.gif)
- [`boost`](./fx/boost.gif)
- [`ground slam`](./fx/ground-slam.gif)

## 자동 검증

- `npm run check`: lint, TypeScript, 15개 test file / 91개 test 통과
- `npm run build`: check 재실행, Vite production build, Electron TypeScript build 통과
- `public/assets/manifest.json`과 TypeScript manifest의 구조적 동등성 확인
- 본체 7개와 FX 4개의 RGBA PNG 크기, 256×256 cell 수, prompt 존재 여부 확인
- 모든 수락 processor metadata에서 empty/source-edge/output-edge/paste-clamp 0 확인
- feet/bottom 정렬 body 전 frame의 opaque bottom `y=228` 확인
- ground-slam FX의 ground anchor `y=233` 확인
- hit-stop 중 동일한 `actionFrame`이 동일 pose를 선택하는 단위 테스트 추가
- 전투 SFX는 `HitLanded`와 `ground-impact` event에서만 파생됨을 단위 테스트로 확인

## 최종 콤보 재현

- [`J → J → K → Shift → J → J → K 최종 combo clip`](./final-combo.mp4)
- [`최종 combo contact sheet`](./final-combo-contact-sheet.png)
- [`CDP runtime state timeline`](./runtime-timeline.json)
- [`Launcher 공중 분리`](./launcher-airborne.png)
- [`Homing chase와 boost FX`](./homing-chase.png)
- [`공중 2타 이후 elevation`](./air-combo.png)
- [`Finisher와 ground-slam FX`](./ground-slam.png)

`npm run demo:m4`를 1024×768 Chromium CDP runtime에 실행했다. 콤보는
900 HP에서 지상 1타 840, 지상 2타 750, launcher 675, 공중 1타 625, 공중 2타 560,
finisher 420으로 진행했고, 대상은 `airborne → downed → grounded`를 통과했다.

QC 원본은 다음 aggregate metadata에서 수락한 processor 결과까지 추적할 수 있다.

- [`body sheet QC`](../../../assets/metadata/characters/player/mech-actions.pipeline.json)
- [`combat FX QC`](../../../assets/metadata/fx/mech-combat.pipeline.json)

## 사용자 실행 화면 확인 결과

- idle, move, 지상 2타, launcher, 공중 2타, finisher, hurt, knockdown의 identity와
  body scale 유지: OK
- idle에서 지상 공격 전환 시 feet anchor 안정성: OK
- slash/impact/boost/ground-slam FX의 body 축소·cell 잘림 없음: OK
- hit-stop 중 body pose 정지와 FX/camera shake 진행: OK
- 첫 액션과 첫 FX의 눈에 띄는 texture upload hitch 없음: OK
- melee, launcher, air, finisher, ground slam 최소 SFX 구분: OK

## SHA-256

```text
cf9976045c832177a82ab2442d2c6f9e659842a52f9362225fff9488b012d3cb  actions/air-combo.gif
33ed72ec08f98f0983a00fde81c7f48798fa221282bbc711085ea5479b61436d  actions/finisher.gif
432752bc6a6d83cc0b819381f1ea8a3941df7fa6f5b2b7e603cdd98eba8c7165  actions/ground-combo.gif
ec31fae7e1f7c96d6a809e2e6662d4634836f5b37f77aa2f7e9acb04ea0873c0  actions/hurt.gif
1d715668c229a0d915f1febdfa3aa6595ecea90a9b8514d32654f4437d6d9a02  actions/knockdown.gif
09cdac53321c2707fcde5abd09f37bfd535155afc8d721b57a4513126edd8317  actions/launcher.gif
872642b66fe95ffc86fc100a18769a025770374116f822f442a8fcf7313a1bc1  actions/move.gif
da8e9c1d000d13cd3ce368168d73465000d04854b7acd2a8aedd5b6bbc3c236d  fx/boost.gif
cf15303f3bfa633c0ab49afa66eb2217a8a9de0ec8ca21115e3c26d0f7cdb10c  fx/ground-slam.gif
282230bf6c9c485c47b1218c52690ca8e68116dcfabda4cf6baca16c9856ffff  fx/impact.gif
bbc2d72c56e285a595499fceddb50a710837e09bc14d886bed0a821e317faf06  fx/slash.gif
6eb96d72b42f6444ff1aff88a42770f73cdfd58fad5bcf4fe182b42d059c2f33  final-combo.mp4
9482591f37a473e45d077ef421f35998a20052413e740c9600e6d02beb0c4557  final-combo-contact-sheet.png
e5a3e8ccdc95abfa44a864e70d94aa0e9e323067d7d4c7c6baa6cdc5b217a442  launcher-airborne.png
88aab7e3df756046a22400689cc9efb980fac354eee9768e52cd585206e1ae6f  homing-chase.png
7e551731f4f06ffad8cefe508e2fd9650f828560f88f17e8d2e08547598830fc  air-combo.png
1cafb022c1e49d9169bb6c470a57b97973a58fc97b85d679d64463ebf199991f  ground-slam.png
7adc5aba0e9b491c972d41e108a3566b5d0bab3100579c36b05919b207832ed3  runtime-timeline.json
```
