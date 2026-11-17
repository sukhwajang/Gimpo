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
def copernicus_sampler():
    """Copernicus DEM GLO-30 (AWS 공개 버킷, 키 불필요). SRTM(2000년)은 충주기업도시를 깎기 전
    산 모양이라 공장이 언덕에 묻힌다. Copernicus는 2011~2015년 측량이라 조성된 단이 보인다.
    단, 건물·나무 높이가 섞인 표면모델(DSM)이므로 grade_developed()에서 깎아 낸다."""
    try:
        import rasterio
    except ImportError:
        return None
    srcs = {}
    for lat in range(math.floor(S), math.floor(N) + 1):
        for lon in range(math.floor(W), math.floor(E) + 1):
            name = f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"
            p = CACHE / f"cop_N{lat}_E{lon}.tif"
            if not p.exists():
                print("  받는 중", name)
                p.write_bytes(http_get(f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"))
            r = rasterio.open(p)
            srcs[(lat, lon)] = (r, r.read(1))

    def h(lon, lat):
        k = (math.floor(lat), math.floor(lon))
        if k not in srcs:
            return None
        r, arr = srcs[k]
        fr, fc = r.index(lon, lat, op=float)
        fr -= 0.5; fc -= 0.5
        r0, c0 = math.floor(fr), math.floor(fc)
        if r0 < 0 or c0 < 0 or r0 + 1 >= arr.shape[0] or c0 + 1 >= arr.shape[1]:
            return None
        ty, tx = fr - r0, fc - c0
        v = (arr[r0, c0] * (1 - tx) + arr[r0, c0 + 1] * tx) * (1 - ty) + (arr[r0 + 1, c0] * (1 - tx) + arr[r0 + 1, c0 + 1] * tx) * ty
        return float(v) if v > -100 else None
    return h


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

    cop = copernicus_sampler()
    if cop:
        print("지형 원본: Copernicus DEM GLO-30 (2011~2015 측량)")
        srtm_sample = sample
        sample = lambda lon, lat: cop(lon, lat) or srtm_sample(lon, lat)
    else:
        print("지형 원본: SRTM (2000년 측량, 공단 조성 전 지형이라 부정확)")
    cell = CFG["terrainCellM"]
    cnt = int(2 * HALF / cell) + 1
    grid = [[sample(LON0 + (-HALF + i * cell) / M_LON, LAT0 + (-HALF + j * cell) / M_LAT)
             for i in range(cnt)] for j in range(cnt)]
    # 계단 무늬를 줄이려고 가볍게 한 번 평활화
    for _ in range(1):
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


def grade_developed(cnt, cell, grid, buildings, roads, areas):
    """표면모델(DSM)에서 개발지의 건물·나무 높이를 걷어 내고 공장 터를 평평하게 고른다.
    1) 개발지(건물 둘레 25m, 공업·주거·상업 용지, 도로 둘레)를 표시
    2) 그 안에서 반경 90m 열림 필터로 건물·나무·둔덕을 깎고 크게 평활화
    3) 붙어 있는 건물은 한 터로 묶어 하위 30% 높이로 고르고 둘레 50m 에 걸쳐 이어 붙임
    """
    import numpy as np
    from shapely.geometry import Polygon, LineString, Point
    from shapely.ops import unary_union
    from shapely.prepared import prep
    g = np.array(grid, dtype=float)
    parts = []
    for b in buildings:
        try:
            parts.append(Polygon(b["ring"]).buffer(25))
        except Exception:
            pass
    for a in areas:
        if a["kind"] in ("industrial", "residential", "commercial", "parking") and len(a["ring"]) >= 3:
            parts.append(Polygon(a["ring"]).buffer(0))
    for r in roads:
        if r["w"] >= 5 and not r["tunnel"]:
            parts.append(LineString(r["pts"]).buffer(r["w"] / 2 + 6))
    dev = prep(unary_union([p for p in parts if p.is_valid]))
    xs = [-HALF + i * cell for i in range(cnt)]
    mask = np.array([[dev.contains(Point(xs[i], xs[j])) for i in range(cnt)] for j in range(cnt)])

    def filt(a, rad, fn):
        out = a.copy()
        p = np.pad(a, rad, mode="edge")
        for dj in range(-rad, rad + 1):
            for di in range(-rad, rad + 1):
                if di * di + dj * dj <= rad * rad:
                    out = fn(out, p[rad + dj:rad + dj + cnt, rad + di:rad + di + cnt])
        return out
    def blur(a, sigma_cells):
        k = int(sigma_cells * 2.5)
        w = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma_cells) ** 2); w /= w.sum()
        p = np.pad(a, k, mode="edge")
        h = np.zeros((cnt + 2 * k, cnt))
        for t in range(2 * k + 1):
            h += w[t] * p[:, t:t + cnt]
        v = np.zeros((cnt, cnt))
        for t in range(2 * k + 1):
            v += w[t] * h[t:t + cnt, :]
        return v
    # 공단은 계단식으로 깎아 고른 땅인데 30m 표고자료로는 그 단이 드러나지 않는다.
    # 개발지는 폭 180m 보다 좁은 둔덕을 깎고(열림) 크게 평활화해 완만한 평지로 만든다.
    rad = max(int(round(90 / cell)), 1)
    opened = filt(filt(g, rad, np.minimum), rad, np.maximum)
    graded = np.minimum(blur(opened, 60 / cell), opened + 2)
    soft = np.clip(blur(mask.astype(float), 30 / cell) * 1.6, 0, 1)  # 개발지 경계를 부드럽게 잇는 가중치
    g = graded * soft + g * (1 - soft)
    print(f"  개발지 {mask.mean() * 100:.0f}% 를 평탄화, 최대 {float((np.array(grid) - g).max()):.0f} m 깎음")

    # 가까이 붙은 건물(18m 이내)은 한 덩어리 터로 묶고, 덩어리마다 한 높이로 고른다.
    # 터 둘레 15m 까지는 그 높이, 15~50m 사이는 주변 지형으로 서서히 이어 붙인다.
    polys = []
    for bd in buildings:
        try:
            pg = Polygon(bd["ring"])
            if pg.is_valid and bd["area"] >= 60:
                polys.append(pg.buffer(9))
        except Exception:
            pass
    merged = unary_union(polys)
    clusters = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    pts = [[Point(xs[i], xs[j]) for i in range(cnt)] for j in range(cnt)]
    wsum = np.zeros_like(g); acc = np.zeros_like(g)
    for c in sorted(clusters, key=lambda c: c.area):
        minx, miny, maxx, maxy = c.bounds
        i0 = max(int((minx - 50 + HALF) / cell), 0); i1 = min(int((maxx + 50 + HALF) / cell) + 1, cnt - 1)
        j0 = max(int((miny - 50 + HALF) / cell), 0); j1 = min(int((maxy + 50 + HALF) / cell) + 1, cnt - 1)
        inside = [g[j][i] for j in range(j0, j1 + 1) for i in range(i0, i1 + 1) if c.contains(pts[j][i])]
        if not inside:
            ci, cj = int((c.centroid.x + HALF) / cell), int((c.centroid.y + HALF) / cell)
            inside = [g[min(max(cj, 0), cnt - 1)][min(max(ci, 0), cnt - 1)]]
        pad = float(np.percentile(inside, 30))
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                d = c.distance(pts[j][i])
                w = 1.0 if d <= 15 else max(0.0, 1 - (d - 15) / 35)
                w = w * w * (3 - 2 * w)
                if w > 0:
                    # 겹치는 곳은 가까운 터가 우선
                    acc[j, i] += pad * w ** 4; wsum[j, i] += w ** 4
    blend = np.where(wsum > 0, acc / np.maximum(wsum, 1e-9), g)
    near = np.minimum(wsum, 1.0) ** 0.25  # 가장 가까운 터의 영향 정도
    g = blend * near + g * (1 - near)
    # 단 경계만 부드럽게
    s2 = g.copy()
    s2[1:-1, 1:-1] = (g[1:-1, 1:-1] * 4 + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]) / 8
    flat = [round(float(v), 1) for v in s2.ravel()]
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
    buildings = build_buildings(force)
    print("건물", len(buildings), "/ 부지 안", sum(b["site"] for b in buildings))
    roads, areas, pois = build_osm(force); print("도로", len(roads), "면", len(areas), "지점", len(pois))
    cnt, cell, grid = build_terrain()
    terrain = grade_developed(cnt, cell, grid, buildings, roads, areas); print("지형", cnt, "x", cnt)
    sb = CFG["siteBounds"]
    scene = {
        "name": CFG["name"], "address": CFG["address"], "origin": CFG["origin"], "halfExtentM": HALF,
        "mPerDegLon": M_LON, "mPerDegLat": M_LAT,
        "siteRing": [to_local(sb["west"], sb["south"]), to_local(sb["east"], sb["south"]),
                     to_local(sb["east"], sb["north"]), to_local(sb["west"], sb["north"])],
        "siteEstimated": True,
        "attribution": "건물 윤곽: Overture Maps Foundation (OpenStreetMap + 위성영상 기반 ML 윤곽 doi:10.5281/zenodo.8174931) · 도로/녹지: © OpenStreetMap contributors (ODbL) · 지형: Copernicus DEM GLO-30 © DLR/Airbus, ESA (AWS 공개 데이터)",
        "terrain": terrain, "buildings": buildings, "roads": roads, "areas": areas, "pois": pois,
    }
    out = ROOT / "public" / "data" / "scene.json"
    out.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("저장", out, f"{out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
