#!/usr/bin/env python3
"""브이월드 2D 데이터 API에서 건물 자료 두 가지를 받아 .cache/ 에 저장한다.
그 뒤 build_data.py 를 다시 돌리면 장면에 반영된다.

  1) GIS건물통합정보 (LT_C_BLDGINFO, 건축물대장 기반) -> .cache/vworld_bldginfo.json
     건물 윤곽, 높이(m), 지상·지하 층수, 주용도, 사용승인일. 장면 건물의 기준 자료로 쓴다.
  2) 도로명주소 건물 (LT_C_SPBD) -> .cache/vworld_buildings.json
     건물명·동 이름·도로명주소. 1)에 이름이 없을 때 이름을 채운다.

  2026-11-18 국내 PC에서 실제 호출로 확인함.

사용:  VWORLD_KEY=발급키 VWORLD_DOMAIN=등록한서비스URL python3 scripts/import_vworld.py --site chungju
       (Windows PowerShell: $env:VWORLD_KEY="키"; $env:VWORLD_DOMAIN="http://localhost:5173"; python scripts/import_vworld.py --site chungju)
"""
import json, math, os, ssl, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = sys.argv[sys.argv.index("--site") + 1] if "--site" in sys.argv else "chungju"
CFG = json.loads((ROOT / "sites" / f"{SITE}.json").read_text(encoding="utf-8"))
CACHE = ROOT / ".cache" / SITE

# 사내망 SSL 검사 장비의 인증서는 Python 3.13의 엄격 검사(VERIFY_X509_STRICT)에 걸린다.
# 인증서 검증 자체는 유지하고 엄격 플래그만 끈다.
SSL_CTX = ssl.create_default_context()
SSL_CTX.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)

key = os.environ.get("VWORLD_KEY")
if not key:
    sys.exit("VWORLD_KEY 환경변수에 브이월드 인증키를 넣어 주세요.")
lat0, lon0, half = CFG["origin"]["lat"], CFG["origin"]["lon"], CFG["halfExtentM"]
dlon = half / (111_320.0 * math.cos(math.radians(lat0)))
dlat = half / 111_132.0
box = f"BOX({lon0 - dlon:.6f},{lat0 - dlat:.6f},{lon0 + dlon:.6f},{lat0 + dlat:.6f})"


def fetch_layer(layer):
    feats, page = [], 1
    while True:
        q = urllib.parse.urlencode({
            "service": "data", "request": "GetFeature", "data": layer, "key": key,
            "domain": os.environ.get("VWORLD_DOMAIN", ""), "geomFilter": box, "crs": "EPSG:4326",
            "format": "json", "size": 1000, "page": page, "geometry": "true", "attribute": "true",
        })
        with urllib.request.urlopen(f"https://api.vworld.kr/req/data?{q}", timeout=60, context=SSL_CTX) as r:
            res = json.load(r)["response"]
        if res.get("status") != "OK":
            if page == 1 and res.get("status") != "NOT_FOUND":
                sys.exit(f"브이월드 응답 오류({layer}): {json.dumps(res, ensure_ascii=False)[:400]}")
            break
        feats += res["result"]["featureCollection"]["features"]
        if page >= int(res.get("page", {}).get("total", 1)):
            break
        page += 1
    return feats


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


bldg = []
for f in fetch_layer("LT_C_BLDGINFO"):
    p = f.get("properties", {})
    bldg.append({
        "id": str(f.get("id", "")).split(".")[-1],
        "name": p.get("bld_nm") or None, "dong": p.get("dong_nm") or None,
        "height": num(p.get("height")), "floors": num(p.get("grnd_flr")), "basement": num(p.get("ugrnd_flr")),
        "use": p.get("usability") or None, "approved": p.get("useapr_day") or None,
        "geometry": f["geometry"],
    })

spbd = []
for f in fetch_layer("LT_C_SPBD"):
    p = f.get("properties", {})
    name = " ".join(x for x in (p.get("buld_nm"), p.get("buld_nm_dc")) if x) or None
    addr = f"{p.get('rd_nm', '')} {p.get('buld_no', '')}".strip() or None
    spbd.append({"name": name, "floors": p.get("gro_flo_co"), "address": addr, "geometry": f["geometry"]})

CACHE.mkdir(parents=True, exist_ok=True)
(CACHE / "vworld_bldginfo.json").write_text(json.dumps(bldg, ensure_ascii=False), encoding="utf-8")
(CACHE / "vworld_buildings.json").write_text(json.dumps(spbd, ensure_ascii=False), encoding="utf-8")
print(f"[{SITE}] 건축물대장 건물 {len(bldg)}동, 도로명주소 건물 {len(spbd)}동 저장. 이제 build_data.py --site {SITE} 를 실행하세요.")
