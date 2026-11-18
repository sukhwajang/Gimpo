# 코오롱생명과학 사업장 3D 지도

오픈 데이터로 만든 사업장 주변 3D 지도입니다. 사업장은 오른쪽 위 메뉴(또는 주소 `?site=`)로 고릅니다.

| id | 사업장 | 주소 · 부지(지적도 필지) |
|---|---|---|
| `chungju` | 코오롱생명과학·코오롱바이오텍 충주공장 | 충주시 대소원면 기업도시1로 54 · 영평리 572. KLS·KBT가 같은 부지라 건물마다 `소속`을 지정합니다. |
| `gimcheon2` | 코오롱생명과학 김천2공장 | 김천시 어모면 산업단지2로 77 · 남산리 1884 |
| `magok` | 코오롱생명과학 연구소 (마곡 One&Only타워) | 서울 강서구 마곡동로 110 · 마곡동 788 |
 **드론으로 날거나**, **사람 눈높이로 걸으면서** 시설을 둘러볼 수 있습니다. 서버 없이 도는 정적 웹앱이고 휴대폰(터치 조이스틱)에서도 됩니다.

![드론 모드](docs/screenshot-drone.png)

## 실행

```bash
cd chungju-plant-3d
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 정적 사이트 생성
```

## 조작

| 보기 | 키보드·마우스 | 터치 |
|---|---|---|
| 조감 `1` | 끌어서 회전, 휠 확대, 오른쪽 끌기 이동 | 한 손가락 회전, 두 손가락 확대·이동 |
| 드론 `2` | `WASD` 이동, `E`/`Q` 상승·하강, `Shift` 빠르게, 끌어서 둘러보기, `F` 마우스 고정 | 왼쪽 조이스틱 이동, 화면 끌어 둘러보기, ▲▼ |
| 보행 `3` | `WASD` 걷기, `Shift` 달리기 (건물은 통과 못 함, 지형을 따라 걸음) | 위와 같음 |

- 건물을 누르면 **이름·소속(여러 회사 부지)·용도·높이(또는 층수)·메모**를 고칠 수 있습니다.
- **잘못된 건물 고치기**: 같은 패널에서
  - `건물 지우기`(또는 `Delete` 키): 실제로 없는 건물을 지웁니다. 시설 목록 맨 아래 `지운 건물`에서 `복원`할 수 있습니다.
  - `위치 ←→↑↓`(1m, Shift 5m), `회전 ⟲⟳`(2°, Shift 10°), `크기 －＋`(5%): 항공사진과 어긋난 윤곽을 맞춥니다.
  - `원래대로`: 그 건물에서 고친 내용을 모두 되돌립니다.
  - 여러 개를 지울 때는 설정의 `누르는 건물 바로 지우기`를 켜고 차례로 누릅니다.
- 고친 내용은 사업장별로 브라우저에 저장됩니다. `시설 정보 내보내기`로 받은 `facilities.json`을 `public/data/<사업장 id>/`에 넣어 커밋하면 모두에게 적용됩니다. 건물 id는 데이터를 다시 만들어도 유지됩니다.
- 시설 목록에서 고르면 그 시설 앞으로 이동합니다. 미니맵을 누르면 그 지점으로 갑니다.

## 지금 데이터의 한계 (꼭 읽어 주세요)

| 항목 | 출처 | 상태 |
|---|---|---|
| 사업장 위치 | 브이월드 주소 검색·연속지적도 | 주소 지점의 필지 윤곽을 부지로 씁니다(`sites/<id>.json`의 `siteParcel`, 2026-11-18 조회). 공장이 여러 필지에 걸치면 한 필지만 잡히니, 빠진 건물은 앱에서 `부지 내 시설로 표시`를 켭니다. 충주는 기업도시1로 54 = 「충주GMP공장 가·나·라·사동」. 김천2공장 주소는 사내 사업장 목록 기준입니다. |
| 건물 윤곽 | 위성영상 자동 추출(Overture) + 브이월드 건축물대장 GIS | 대장 GIS 윤곽은 항공사진과 10~20m 어긋나거나 돌아간 곳이 많아, **모양은 영상 추출 윤곽을, 있는지 여부·속성은 대장을** 기준으로 씁니다. 대장에 없는 자동 추출분은 200㎡ 이상·반듯한 모양만 "미등록"으로 남기고(차량·컨테이너 제거), 영상에 없는 대장 건물은 대장 윤곽으로 넣습니다. 남은 오류는 앱에서 지우거나 위치를 맞춥니다. |
| 건물 높이 | 건축물대장 높이·지상 층수 | 대장 높이(m) → 층수 × 4.5m(아파트 2.9m) → **면적 어림** 순입니다. 앱에서 건물마다 고칠 수 있습니다. |
| 시설 이름 | 건축물대장 건물명·동명, 도로명주소 건물명 | 이름이 등록되지 않은 건물은 `시설 01`… 면적순 임시 이름입니다. 대장 용도·사용승인일은 건물 정보에 표시됩니다. |
| 도로·녹지 | OpenStreetMap | 공장 내부 도로는 거의 없습니다. |
| 지형 | Copernicus DEM 30m (2011~2015 측량) | 30m 해상도라 공단의 계단식 평탄면·옹벽이 드러나지 않습니다. 개발지는 둔덕을 깎아 평탄화하고, 붙은 건물은 한 터로 묶어 같은 높이로 골랐습니다. 정확한 지형은 국토지리정보원 5m DEM이 필요합니다. |

## 데이터 다시 만들기

```bash
pip install -r scripts/requirements.txt
npm run data                                   # 모든 사업장 → public/data/<id>/scene.json (.cache/<id>/ 에 원본 보관)
python3 scripts/build_data.py --site magok     # 한 곳만
python3 scripts/build_data.py --site magok --refresh   # 원본도 새로 받기
```

### 사업장 추가

```bash
VWORLD_KEY=키 python3 scripts/new_site.py --id ulsan --name "OO공장" --short "울산" --address "도로명주소" [--half 1200] [--companies "회사1,회사2"]
VWORLD_KEY=키 VWORLD_DOMAIN=http://localhost:5173 python3 scripts/import_vworld.py --site ulsan
python3 scripts/build_data.py --site ulsan     # public/data/sites.json 목록도 갱신
```
`--half`는 지도 반경(m)입니다. 도심은 건물이 많아 600~800을 권합니다(마곡 700).

### 브이월드로 보강

1. **항공사진**: 앱 설정에 브이월드 API 키를 넣거나, `chungju-plant-3d/.env.local` 파일에 `VITE_VWORLD_KEY=키` 한 줄을 적고(커밋 금지, git이 무시함) `지면에 항공사진 입히기`를 켭니다. 브이월드에서 키의 서비스 URL에 앱 주소(`http://localhost:5173` 등)를 등록해야 합니다.
2. **건물(건축물대장)·이름·층수**: `VWORLD_KEY=키 VWORLD_DOMAIN=등록URL python3 scripts/import_vworld.py --site <id>` 후 `npm run data`. GIS건물통합정보(LT_C_BLDGINFO)와 도로명주소 건물(LT_C_SPBD)을 `.cache/<id>/`에 받습니다.

브이월드는 해외 IP 접속을 막아 해외 클라우드에서는 쓸 수 없고, 한국 PC에서 실행해야 합니다. 2026-11-18 국내 PC에서 두 기능 모두 실제 호출로 확인했습니다(항공사진 WMTS는 CORS 허용). Windows에서는 `python3` 대신 `python`, 환경변수는 PowerShell에서 `$env:VWORLD_KEY="키"`로 넣습니다. 사내망 SSL 검사 인증서 때문에 두 스크립트는 Python 3.13의 엄격 인증서 검사만 끕니다(검증 자체는 유지).

## 실사 고도화 순서

1. 브이월드 항공사진을 지면에 입힘 (위 1번, 이미 구현).
2. 건물 높이·이름을 현장 자료로 보정 (`facilities.json`).
3. 드론 촬영 → 사진측량(WebODM, RealityCapture 등) → glTF/GLB로 내보내 `public/models/`에 두고 `public/data/<id>/overlays.json`에 등록:
   ```json
   [{ "url": "./models/plant.glb", "lat": 36.9968, "lon": 127.8236, "headingDeg": 0, "scale": 1, "altOffsetM": 0, "hideBuildingIds": ["..."] }]
   ```
   모델이 좌표에 맞춰 얹히고, 대체되는 상자 건물은 숨겨집니다.
4. 모델이 커지면 3D Tiles(`3d-tiles-renderer`)나 가우시안 스플랫으로 바꿔 스트리밍합니다. 좌표계(원점 기준 동·북 미터)는 그대로 씁니다.

공장 내부 촬영·공개는 회사 보안 규정과 드론 비행 승인 대상일 수 있으니 먼저 확인하세요.

## 구조

```
sites/<id>.json          사업장별 위치·범위·부지·소속 회사 설정
scripts/new_site.py      주소 → sites/<id>.json (좌표·필지 자동)
scripts/import_vworld.py 브이월드 건축물대장·도로명주소 건물 받기
scripts/build_data.py    오픈 데이터 → public/data/<id>/scene.json, public/data/sites.json
public/data/<id>/        facilities.json(고친 내용), overlays.json(실사 모델)
src/ground.ts           지형 높이, 지면 그림(도로·녹지·항공사진)
src/world.ts            건물·나무·하늘·조명, 실사 모델 얹기
src/controls.ts         조감·드론·보행 조작
src/main.ts             UI (시설 목록, 편집, 미니맵)
```

## 구글 실사 3D(Photorealistic 3D Tiles)를 쓰지 않은 이유

- 한국은 지도 데이터 국외 반출 제한 때문에 구글 3D 실사 지도가 제공되지 않는 지역으로 알고 있습니다. 쓰려면 Google Cloud Map Tiles API 키(결제 등록 필요)로 이 좌표를 직접 시험해 봐야 합니다.
- 제공되더라도 약관상 내려받아 저장하거나 고칠 수 없고, 스트리밍으로만 보여 줘야 합니다.
- 국내에서 쓸 수 있는 실사 자료는 **브이월드 항공사진·3D 건물**(키 필요), 그리고 **직접 드론 촬영한 사진측량 모델**입니다.

데이터 저작권: 건물 © Overture Maps Foundation · © OpenStreetMap contributors (ODbL), 지형 Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA.
