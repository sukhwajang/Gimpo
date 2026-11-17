#!/usr/bin/env python3
"""오픈 데이터로 공장 주변 3D 장면 데이터(public/data/scene.json)를 만든다.

  건물 윤곽  Overture Maps (OSM + 위성영상 기반 ML 윤곽, 키 불필요)
  도로·녹지  OpenStreetMap 공식 API
  지형      AWS Terrain Tiles (Terrarium, SRTM 기반)

사용:  pip install -r scripts/requirements.txt && python3 scripts/build_data.py
옵션:  --skip-overture  (이미 받은 캐시 .cache/ 를 재사용)
"""
import io, json, math, os, sys, urllib.request, hashlib
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)
UA = {"User-Agent": "plant-3d-map-builder/1.0"}

LAT0, LON0 = CFG["origin"]["lat"], CFG["origin"]["lon"]
HALF = CFG["halfExtentM"]
M_LAT = 111_132.0
M_LON = 111_320.0 * math.cos(math.radians(LAT0))
W, E = LON0 - HALF / M_LON, LON0 + HALF / M_LON
S, N = LAT0 - HALF / M_LAT, LAT0 + HALF / M_LAT


def to_local(lon, lat):
    """경위도 -> 원점 기준 미터 (x: 동쪽, y: 북쪽)"""
    return [round((lon - LON0) * M_LON, 2), round((lat - LAT0) * M_LAT, 2)]


def http_get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read()


def cached(name, fn, force=False):
    p = CACHE / name
    if p.exists() and not force:
        return p.read_bytes()
    data = fn()
    p.write_bytes(data)
    return data


# ---------- 지형 ----------
def build_terrain():
    from PIL import Image
    z = CFG["terrainZoom"]
    n = 2 ** z

    def tile_xy(lon, lat):
        x = (lon + 180) / 360 * n
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        return x, y

    tiles = {}

    def sample(lon, lat):
        fx, fy = tile_xy(lon, lat)
        px, py = fx * 256 - 0.5, fy * 256 - 0.5
        x0, y0 = math.floor(px), math.floor(py)
        tx, ty = px - x0, py - y0

        def h(ix, iy):
            t = (ix // 256, iy // 256)
            if t not in tiles:
                raw = cached(f"terrain_{z}_{t[0]}_{t[1]}.png", lambda: http_get(
                    f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{t[0]}/{t[1]}.png"))
                tiles[t] = Image.open(io.BytesIO(raw)).convert("RGB").load()
            r, g, b = tiles[t][ix % 256, iy % 256]
            return r * 256 + g + b / 256 - 32768

        return (h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx) * (1 - ty) + \
               (h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx) * ty

    cell = CFG["terrainCellM"]
    cnt = int(2 * HALF / cell) + 1
    grid = [[sample(LON0 + (-HALF + i * cell) / M_LON, LAT0 + (-HALF + j * cell) / M_LAT)
             for i in range(cnt)] for j in range(cnt)]
    # SRTM 계단 무늬를 줄이려고 가볍게 두 번 평활화
    for _ in range(2):
        g2 = [row[:] for row in grid]
        for j in range(cnt):
            for i in range(cnt):
                acc = wsum = 0
                for dj in (-1, 0, 1):
                    for di in (-1, 0, 1):
                        jj, ii = j + dj, i + di
                        if 0 <= jj < cnt and 0 <= ii < cnt:
                            w = 2 if (di == 0 and dj == 0) else 1
                            acc += grid[jj][ii] * w
                            wsum += w
                g2[j][i] = acc / wsum
        grid = g2
    return cnt, cell, grid


def level_pads(cnt, cell, grid, buildings):
    """SRTM(30m)에는 공장 터 닦은 면이 드러나지 않아 큰 건물이 비탈에 걸린다.
    큰 건물 둘레(10m 여유)를 그 자리 중앙값 높이로 고르고 경계를 한 번 평활화한다."""
    import statistics
    for b in sorted(buildings, key=lambda b: b["area"]):
        if b["area"] < 300:
            continue
        xs = [p[0] for p in b["ring"]]; ys = [p[1] for p in b["ring"]]
        i0 = max(int((min(xs) - 10 + HALF) / cell), 0); i1 = min(int((max(xs) + 10 + HALF) / cell) + 1, cnt - 1)
        j0 = max(int((min(ys) - 10 + HALF) / cell), 0); j1 = min(int((max(ys) + 10 + HALF) / cell) + 1, cnt - 1)
        cells = [(j, i) for j in range(j0, j1 + 1) for i in range(i0, i1 + 1)]
        if not cells:
            continue
        med = statistics.median(grid[j][i] for j, i in cells)
        for j, i in cells:
            grid[j][i] = med
    g2 = [row[:] for row in grid]
    for j in range(1, cnt - 1):
        for i in range(1, cnt - 1):
            g2[j][i] = (grid[j][i] * 4 + grid[j - 1][i] + grid[j + 1][i] + grid[j][i - 1] + grid[j][i + 1]) / 8
    flat = [round(v, 1) for row in g2 for v in row]
    return {"size": cnt, "cellM": cell, "minX": -HALF, "minY": -HALF,
            "note": "heights[j*size+i], i: 서->동, j: 남->북, 단위 m(해발)", "heights": flat}


# ---------- 건물 (Overture) ----------
def fetch_overture():
    import pyarrow.fs as fs, pyarrow.dataset as ds, pyarrow.compute as pc
    kw = {}
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        u = urlparse(proxy)
        kw["proxy_options"] = {"scheme": u.scheme or "http", "host": u.hostname, "port": u.port}
    s3 = fs.S3FileSystem(anonymous=True, region="us-west-2", **kw)
    d = ds.dataset(f"overturemaps-us-west-2/release/{CFG['overtureRelease']}/theme=buildings/type=building/",
                   filesystem=s3, format="parquet")
    f = (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) & \
        (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S)
    tb = d.to_table(filter=f, columns=["id", "names", "height", "num_floors", "class", "sources", "geometry"])
    from shapely import wkb
    from shapely.geometry import mapping
    out = []
    for r in tb.to_pylist():
        out.append({"id": r["id"], "name": (r["names"] or {}).get("primary"),
                    "height": r["height"], "floors": r["num_floors"], "class": r["class"],
                    "src": (r["sources"] or [{}])[0].get("dataset"),
                    "geometry": mapping(wkb.loads(r["geometry"]))})
    return json.dumps(out, ensure_ascii=False).encode()


def ring_area(r):
    return abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2


def build_buildings(force):
    import re
    raw = json.loads(cached("overture_buildings.json", fetch_overture, force))
    # 브이월드 건물 자료(scripts/import_vworld.py)가 있으면 이름·층수를 같은 자리 건물에 옮긴다
    vw = []
    vp = CACHE / "vworld_buildings.json"
    if vp.exists():
        from shapely.geometry import shape
        vw = [(shape(v["geometry"]), v) for v in json.loads(vp.read_text(encoding="utf-8"))]
    sb = CFG["siteBounds"]
    out = []
    for b in raw:
        g = b["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for k, poly in enumerate(polys):
            ring = [to_local(x, y) for x, y in poly[0]]
            area = ring_area(ring)
            cx = sum(p[0] for p in ring[:-1]) / (len(ring) - 1)
            cy = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
            if area < 20 or abs(cx) > HALF or abs(cy) > HALF:
                continue
            lon_c, lat_c = LON0 + cx / M_LON, LAT0 + cy / M_LAT
            site = sb["west"] <= lon_c <= sb["east"] and sb["south"] <= lat_c <= sb["north"]
            name, cls = b["name"], b["class"]
            if vw:
                from shapely.geometry import Point
                pt = Point(lon_c, lat_c)
                hit = next((v for g_, v in vw if g_.contains(pt)), None)
                if hit:
                    name = name or hit["name"]
                    try:
                        b["floors"] = b["floors"] or (int(hit["floors"]) if hit["floors"] else None)
                    except (TypeError, ValueError):
                        pass
            apt = cls == "apartments" or bool(name and re.fullmatch(r"\d+동", name))
            est = False
            if b["height"]:
                h = float(b["height"])
            elif b["floors"]:
                h = b["floors"] * (2.9 if apt else 4.5)
            else:
                est = True
                # 높이 자료가 없어 면적으로 어림: 대형 공장 12m, 중형 9m, 소형 5m, 아파트 45m
                j = int(hashlib.md5(b["id"].encode()).hexdigest()[:4], 16) / 65535  # 건물마다 고정된 0~1
                h = 45 + j * 15 if apt else (11 + j * 4 if area > 2000 else 7 + j * 4 if area > 400 else 4 + j * 2)
            out.append({"id": f"{b['id'][:12]}-{k}", "name": name, "kind": "apartment" if apt else "industrial" if (site or area > 400) else "small",
                        "site": site, "h": round(h, 1), "hEst": est, "area": round(area),
                        "src": "osm" if b["src"] == "OpenStreetMap" else "ml",
                        "ring": ring[:-1], "holes": [[to_local(x, y) for x, y in hr][:-1] for hr in poly[1:]]})
    # 공장 부지 안 건물은 큰 순서로 임시 이름을 붙인다 (앱에서 바꿀 수 있음)
    site_b = sorted((b for b in out if b["site"]), key=lambda b: -b["area"])
    for i, b in enumerate(site_b):
        b["label"] = f"시설 {i + 1:02d}"
    return out


# ---------- 도로·녹지 (OSM) ----------
ROAD_W = {"motorway": 20, "trunk": 18, "primary": 16, "secondary": 14, "tertiary": 13, "unclassified": 7,
          "residential": 8, "living_street": 6, "service": 5, "pedestrian": 4, "footway": 2, "path": 1.5, "cycleway": 2}


def build_osm(force):
    raw = json.loads(cached("osm_map.json", lambda: http_get(
        f"https://api.openstreetmap.org/api/0.6/map.json?bbox={W:.5f},{S:.5f},{E:.5f},{N:.5f}"), force))
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in raw["elements"] if e["type"] == "node"}
    roads, areas, pois = [], [], []
    for e in raw["elements"]:
        t = e.get("tags") or {}
        if e["type"] == "node":
            if t.get("name") and ("office" in t or "amenity" in t or "shop" in t):
                pois.append({"name": t["name"], "p": to_local(e["lon"], e["lat"])})
            continue
        if e["type"] != "way":
            continue
        pts = [to_local(*nodes[n]) for n in e["nodes"] if n in nodes]
        if len(pts) < 2:
            continue
        hw = t.get("highway")
        if hw in ROAD_W and t.get("area") != "yes":
            w = ROAD_W[hw]
            if t.get("oneway") == "yes" and hw in ("tertiary", "secondary", "primary"):
                w = w * 0.6  # 상·하행이 따로 그려진 도로
            roads.append({"name": t.get("name"), "kind": hw, "w": w, "tunnel": t.get("tunnel") == "yes", "pts": pts})
            continue
        closed = e["nodes"][0] == e["nodes"][-1] and len(pts) >= 4
        if not closed:
            continue
        kind = None
        if t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest":
            kind = "wood"
        elif t.get("leisure") in ("park", "pitch", "garden") or t.get("landuse") in ("grass", "village_green", "recreation_ground"):
            kind = "green"
        elif t.get("natural") == "water" or t.get("waterway") == "riverbank":
            kind = "water"
        elif t.get("landuse") in ("industrial", "residential", "commercial"):
            kind = t["landuse"]
        elif t.get("amenity") == "parking":
            kind = "parking"
        if kind:
            areas.append({"kind": kind, "name": t.get("name"), "ring": pts[:-1]})
    return roads, areas, pois


def main():
    force = "--refresh" in sys.argv
    print(f"범위 {W:.5f},{S:.5f} ~ {E:.5f},{N:.5f}")
    cnt, cell, grid = build_terrain()
    buildings = build_buildings(force)
    terrain = level_pads(cnt, cell, grid, buildings); print("지형", cnt, "x", cnt)
    print("건물", len(buildings), "/ 부지 안", sum(b["site"] for b in buildings))
    roads, areas, pois = build_osm(force); print("도로", len(roads), "면", len(areas), "지점", len(pois))
    sb = CFG["siteBounds"]
    scene = {
        "name": CFG["name"], "address": CFG["address"], "origin": CFG["origin"], "halfExtentM": HALF,
        "mPerDegLon": M_LON, "mPerDegLat": M_LAT,
        "siteRing": [to_local(sb["west"], sb["south"]), to_local(sb["east"], sb["south"]),
                     to_local(sb["east"], sb["north"]), to_local(sb["west"], sb["north"])],
        "siteEstimated": True,
        "attribution": "건물 윤곽: Overture Maps Foundation (OpenStreetMap + 위성영상 기반 ML 윤곽 doi:10.5281/zenodo.8174931) · 도로/녹지: © OpenStreetMap contributors (ODbL) · 지형: AWS Terrain Tiles (SRTM)",
        "terrain": terrain, "buildings": buildings, "roads": roads, "areas": areas, "pois": pois,
    }
    out = ROOT / "public" / "data" / "scene.json"
    out.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("저장", out, f"{out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
