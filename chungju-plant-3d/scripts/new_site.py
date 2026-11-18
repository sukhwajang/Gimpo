#!/usr/bin/env python3
"""주소로 새 사업장 설정(sites/<id>.json)을 만든다.

브이월드 주소 검색으로 좌표를 얻고, 그 자리 연속지적도 필지(LP_PA_CBND_BUBUN) 윤곽을 부지로 쓴다.
그 뒤 import_vworld.py --site <id> 와 build_data.py --site <id> 를 돌리면 3D 지도가 생긴다.

사용:
  VWORLD_KEY=키 python3 scripts/new_site.py --id gimcheon2 --name "코오롱생명과학 김천2공장" \\
      --address "경상북도 김천시 어모면 산업단지2로 77" [--half 1200] [--short 김천2]
"""
import argparse, json, os, ssl, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SSL_CTX = ssl.create_default_context()
SSL_CTX.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)  # 사내망 SSL 검사 인증서 대응

ap = argparse.ArgumentParser()
ap.add_argument("--id", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--address", required=True)
ap.add_argument("--short", default=None, help="사업장 선택 메뉴에 보일 짧은 이름")
ap.add_argument("--half", type=int, default=1200, help="지도 반경(m). 도심은 600~800 권장")
ap.add_argument("--companies", default="", help="쉼표로 구분한 소속 회사 목록 (건물별 소속 지정용)")
a = ap.parse_args()

key = os.environ.get("VWORLD_KEY") or sys.exit("VWORLD_KEY 환경변수에 브이월드 인증키를 넣어 주세요.")
domain = os.environ.get("VWORLD_DOMAIN", "http://localhost:5173")


def get(url, params):
    with urllib.request.urlopen(url + "?" + urllib.parse.urlencode(params), timeout=60, context=SSL_CTX) as r:
        return json.load(r)["response"]


pt, refined = None, None
for typ in ("road", "parcel"):
    r = get("https://api.vworld.kr/req/address", {"service": "address", "request": "getcoord", "version": "2.0", "crs": "epsg:4326",
                                                   "address": a.address, "refine": "true", "simple": "false", "format": "json", "type": typ, "key": key})
    if r.get("status") == "OK":
        pt, refined = r["result"]["point"], r.get("refined", {}).get("text")
        break
if not pt:
    sys.exit(f"주소를 찾지 못했습니다: {a.address}")
lon, lat = float(pt["x"]), float(pt["y"])
print(f"주소 → {refined} ({lat:.5f}, {lon:.5f})")

r = get("https://api.vworld.kr/req/data", {"service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "key": key, "domain": domain,
                                            "geomFilter": f"POINT({lon} {lat})", "crs": "EPSG:4326", "format": "json", "size": 5,
                                            "geometry": "true", "attribute": "true"})
if r.get("status") != "OK":
    sys.exit(f"필지를 찾지 못했습니다: {json.dumps(r, ensure_ascii=False)[:300]}")
from shapely.geometry import shape
f = r["result"]["featureCollection"]["features"][0]
g = shape(f["geometry"])
if g.geom_type == "MultiPolygon":
    g = max(g.geoms, key=lambda x: x.area)
g = g.simplify(0.000005)
ring = [[round(x, 6), round(y, 6)] for x, y in list(g.exterior.coords)[:-1]]
w, s, e, n = g.bounds
c = g.centroid
print(f"필지 → {f['properties'].get('addr')} ({f['properties'].get('jibun')}), 꼭짓점 {len(ring)}개")

cfg = {
    "id": a.id,
    "name": a.name,
    "short": a.short or a.name,
    "address": refined or a.address,
    "origin": {"lat": round(c.y, 5), "lon": round(c.x, 5)},
    "halfExtentM": a.half,
    "siteBoundsNote": f"브이월드 연속지적도의 필지({f['properties'].get('addr')}) 경계. scripts/new_site.py 로 생성.",
    "siteBounds": {"west": round(w, 5), "east": round(e, 5), "south": round(s, 5), "north": round(n, 5)},
    "siteEstimated": False,
    "siteParcel": {"pnu": f["properties"].get("pnu"), "jibun": f["properties"].get("addr"), "ring": ring},
    "overtureRelease": "2026-10-21.0",
    "terrainZoom": 13,
    "terrainCellM": 15,
}
if a.companies:
    cfg["companies"] = [x.strip() for x in a.companies.split(",") if x.strip()]
out = ROOT / "sites" / f"{a.id}.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"저장 {out}. 이제 import_vworld.py --site {a.id} 와 build_data.py --site {a.id} 를 실행하세요.")
