#!/usr/bin/env python3
"""브이월드 2D 데이터 API에서 건물(도로명주소 건물, LT_C_SPBD)의 이름·층수를 받아
.cache/vworld_buildings.json 에 저장한다. 그 뒤 build_data.py 를 다시 돌리면
같은 자리 건물의 이름과 높이(층수 기반)에 반영된다.

  ※ 이 스크립트는 작성 환경에서 브이월드 접속이 막혀 있어 실제 호출로 검증하지 못했습니다.
     응답 필드 이름(buld_nm, gro_flo_co)이 다르면 아래 FIELD_* 상수를 고쳐 주세요.

사용:  VWORLD_KEY=발급키 VWORLD_DOMAIN=등록한서비스URL python3 scripts/import_vworld.py
"""
import json, math, os, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
FIELD_NAME, FIELD_FLOORS = "buld_nm", "gro_flo_co"

key = os.environ.get("VWORLD_KEY")
if not key:
    sys.exit("VWORLD_KEY 환경변수에 브이월드 인증키를 넣어 주세요.")
lat0, lon0, half = CFG["origin"]["lat"], CFG["origin"]["lon"], CFG["halfExtentM"]
dlon = half / (111_320.0 * math.cos(math.radians(lat0)))
dlat = half / 111_132.0
box = f"BOX({lon0 - dlon:.6f},{lat0 - dlat:.6f},{lon0 + dlon:.6f},{lat0 + dlat:.6f})"

out, page = [], 1
while True:
    q = urllib.parse.urlencode({
        "service": "data", "request": "GetFeature", "data": "LT_C_SPBD", "key": key,
        "domain": os.environ.get("VWORLD_DOMAIN", ""), "geomFilter": box, "crs": "EPSG:4326",
        "format": "json", "size": 1000, "page": page, "geometry": "true", "attribute": "true",
    })
    with urllib.request.urlopen(f"https://api.vworld.kr/req/data?{q}", timeout=60) as r:
        res = json.load(r)["response"]
    if res.get("status") != "OK":
        if page == 1:
            sys.exit(f"브이월드 응답 오류: {json.dumps(res, ensure_ascii=False)[:400]}")
        break
    feats = res["result"]["featureCollection"]["features"]
    for f in feats:
        p = f.get("properties", {})
        out.append({"name": p.get(FIELD_NAME) or None, "floors": p.get(FIELD_FLOORS), "geometry": f["geometry"]})
    if page >= int(res.get("page", {}).get("total", 1)):
        break
    page += 1

(ROOT / ".cache").mkdir(exist_ok=True)
(ROOT / ".cache" / "vworld_buildings.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print(f"건물 {len(out)}개 저장. 이제 python3 scripts/build_data.py 를 다시 실행하세요.")
