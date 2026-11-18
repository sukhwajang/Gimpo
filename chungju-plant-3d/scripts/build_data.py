#!/usr/bin/env python3
"""오픈 데이터로 사업장 주변 3D 장면 데이터(public/data/<사업장>/scene.json)를 만든다.

  건물 윤곽  Overture Maps (OSM + 위성영상 기반 ML 윤곽, 키 불필요)
  도로·녹지  OpenStreetMap 공식 API
  지형      AWS Terrain Tiles (Terrarium, SRTM 기반)

사용:  pip install -r scripts/requirements.txt && python3 scripts/build_data.py --site chungju
옵션:  --site <id>  sites/<id>.json 사업장 (기본 chungju) · --all  모든 사업장
       --refresh   원본(.cache/<id>/)도 새로 받기
"""
import io, json, math, os, ssl, sys, urllib.request, hashlib
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


def _arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv and sys.argv.index(name) + 1 < len(sys.argv) else default


SITE = _arg("--site", "chungju")
CFG = json.loads((ROOT / "sites" / f"{SITE}.json").read_text(encoding="utf-8"))
CACHE = ROOT / ".cache" / SITE
CACHE.mkdir(parents=True, exist_ok=True)
OUT_DIR = ROOT / "public" / "data" / SITE
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


# 사내망 SSL 검사 장비의 인증서는 Python 3.13의 엄격 검사(VERIFY_X509_STRICT)에 걸린다.
# 인증서 검증 자체는 유지하고 엄격 플래그만 끈다.
SSL_CTX = ssl.create_default_context()
SSL_CTX.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)


# 공장 부지: 지적도 필지 윤곽(siteParcel)이 있으면 그것을, 없으면 siteBounds 사각형을 쓴다
_sb = CFG["siteBounds"]
SITE_RING = (CFG.get("siteParcel") or {}).get("ring") or [
    [_sb["west"], _sb["south"]], [_sb["east"], _sb["south"]], [_sb["east"], _sb["north"]], [_sb["west"], _sb["north"]]]


def in_site(lon, lat):
    inside, n = False, len(SITE_RING)
    for i in range(n):
        (x1, y1), (x2, y2) = SITE_RING[i], SITE_RING[(i + 1) % n]
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def http_get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90, context=SSL_CTX) as r:
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


# 건축물대장 주용도 코드 -> 이름 (건축법 시행령 별표1 분류)
USE_NAMES = {"01000": "단독주택", "02000": "공동주택", "03000": "제1종근린생활시설", "04000": "제2종근린생활시설",
             "05000": "문화및집회시설", "06000": "종교시설", "07000": "판매시설", "08000": "운수시설", "09000": "의료시설",
             "10000": "교육연구시설", "11000": "노유자시설", "12000": "수련시설", "13000": "운동시설", "14000": "업무시설",
             "15000": "숙박시설", "16000": "위락시설", "17000": "공장", "18000": "창고시설", "19000": "위험물저장및처리시설",
             "20000": "자동차관련시설", "21000": "동물및식물관련시설", "22000": "자원순환관련시설", "23000": "교정및군사시설",
             "24000": "방송통신시설", "25000": "발전시설", "26000": "묘지관련시설", "27000": "관광휴게시설", "28000": "장례시설",
             "29000": "야영장시설", "30000": "기타"}
ML_KEEP_M2 = 200  # 대장에 없는 자동 추출 윤곽은 이보다 큰 것만 '미등록 추정'으로 남긴다 (작은 것은 대부분 차량·컨테이너)


def est_height(seed, area, apt):
    """높이 자료가 없어 면적으로 어림: 대형 공장 12m, 중형 9m, 소형 5m, 아파트 45m"""
    j = int(hashlib.md5(seed.encode()).hexdigest()[:4], 16) / 65535  # 건물마다 고정된 0~1
    return 45 + j * 15 if apt else (11 + j * 4 if area > 2000 else 7 + j * 4 if area > 400 else 4 + j * 2)


def best_overlap(geom, cands, index=None):
    """겹치는 면적 비율(작은 쪽 기준)이 가장 큰 후보와 그 비율"""
    best, best_r = None, 0.0
    for g_, v in (cands if index is None else [cands[i] for i in index.query(geom)]):
        if not g_.intersects(geom):
            continue
        r_ = g_.intersection(geom).area / max(min(geom.area, g_.area), 1e-12)
        if r_ > best_r:
            best, best_r = v, r_
    return best, best_r


def polys_of(g):
    return [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []


def build_buildings(force):
    import re
    from shapely.geometry import shape, Polygon
    from shapely.strtree import STRtree
    raw = json.loads(cached("overture_buildings.json", fetch_overture, force))
    load = lambda n: json.loads((CACHE / n).read_text(encoding="utf-8")) if (CACHE / n).exists() else []
    spbd = [(shape(v["geometry"]).buffer(0), v) for v in load("vworld_buildings.json")]
    bldg = load("vworld_bldginfo.json")
    out = []

    def emit(bid, seed, poly, name, floors, height, apt_hint, src, extra):
        ring = [to_local(x, y) for x, y in poly[0]]
        area = ring_area(ring)
        cx = sum(p[0] for p in ring[:-1]) / (len(ring) - 1)
        cy = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
        if area < 20 or abs(cx) > HALF or abs(cy) > HALF:
            return
        site = in_site(LON0 + cx / M_LON, LAT0 + cy / M_LAT)
        if spbd and not name:
            hit, r_ = best_overlap(Polygon(poly[0]).buffer(0), spbd)
            if hit and r_ >= 0.3:
                name = hit["name"]
                if not floors:
                    try:
                        floors = int(hit["floors"]) if hit["floors"] else None
                    except (TypeError, ValueError):
                        pass
        # "1동·2동" 이름만으로 아파트라 보면 공장 동 번호까지 아파트 층고(2.9m)가 된다 → 공장 부지 안에서는 쓰지 않는다
        apt = apt_hint or bool(name and re.fullmatch(r"\d+동", name) and not site)
        est = False
        if height:
            h = float(height)
        elif floors:
            h = floors * (2.9 if apt else 4.5)
            if not apt and floors <= 2 and area > 400:
                # 넓은 1~2층 공장·창고는 층고가 높다(8~12m): 면적 어림값보다 낮게 잡지 않는다
                h = max(h, est_height(seed, area, False))
        else:
            est, h = True, est_height(seed, area, apt)
        out.append({"id": bid, "name": name, "kind": "apartment" if apt else "industrial" if (site or area > 400) else "small",
                    "site": site, "h": round(h, 1), "hEst": est, "area": round(area), "src": src,
                    "ring": ring[:-1], "holes": [[to_local(x, y) for x, y in hr][:-1] for hr in poly[1:]], **extra})

    if bldg:
        # 대장 GIS 윤곽은 항공사진과 10~20m 어긋나거나 돌아간 경우가 많고, 같은 건물의 윤곽이 중복으로 들어 있다.
        # 그래서 모양은 영상에서 뽑은 Overture 윤곽을 쓰고, 이름·높이·층수·용도는 겹치는 대장 건물에서 가져온다.
        from shapely.ops import unary_union
        meta = []
        for v in bldg:
            g = shape(v["geometry"]).buffer(0)
            if g.is_empty:
                continue
            meta.append((g, v))
        # 용도 코드가 있는(대장과 연결된) 윤곽을 우선, 그것과 겹치는 용도 없는 윤곽은 중복으로 본다
        meta.sort(key=lambda gv: (gv[1]["use"] is None, -gv[0].area))
        uniq = []
        for g, v in meta:
            if any(u.intersects(g) and u.intersection(g).area > 0.3 * min(u.area, g.area) for u, _ in uniq):
                continue
            uniq.append((g, v))
        tree = STRtree([g for g, _ in uniq])
        union_buf = unary_union([g for g, _ in uniq]).buffer(5 / M_LAT)  # 5m 여유
        reach = 8 / M_LAT  # 속성을 옮길 대장 건물을 찾는 거리
        kept = dropped = 0

        def attrs(v):
            name = " ".join(x for x in (v["name"], v["dong"]) if x) or None
            floors = int(v["floors"]) if v["floors"] and v["floors"] > 0 else None
            height = v["height"] if v["height"] and v["height"] > 1 else None
            extra = {k_: x for k_, x in (("use", USE_NAMES.get(v["use"] or "", None)), ("floors", floors),
                                         ("approved", v["approved"])) if x}
            return name, floors, height, extra

        def compact(g):
            return 4 * math.pi * g.area / max(g.length ** 2, 1e-18)  # 원 1, 정사각형 0.79, 들쭉날쭉할수록 작다

        kept_geoms = []
        for b in raw:
            for k, poly in enumerate(polys_of(b["geometry"])):
                op = Polygon(poly[0]).buffer(0)
                area_m2 = op.area * M_LON * M_LAT
                cover = op.intersection(union_buf).area / max(op.area, 1e-12)
                # 이 윤곽 면적 중 가장 많이 덮는 대장 건물 (작은 쪽 기준으로 재면 큰 오검출 안의 작은 건물 하나로도 '등록'이 된다)
                best, best_r = None, 0.0
                for i in tree.query(op):
                    g_ = uniq[i][0]
                    r_ = g_.intersection(op).area / max(op.area, 1e-12)
                    if r_ > best_r:
                        best, best_r = i, r_
                if best_r < 0.2 and cover >= 0.5:  # 대장 윤곽이 조금 어긋난 경우: 가까운 것 중 가장 많이 걸치는 것
                    for i in tree.query(op.buffer(reach)):
                        a_ = uniq[i][0].intersection(op.buffer(reach)).area / max(op.area, 1e-12)
                        if a_ > best_r:
                            best, best_r = i, a_
                registered = best is not None and (best_r >= 0.2 or cover >= 0.5)
                # 대장에 없는 것은 실제 건물일 법한 것만 남긴다: 200㎡ 이상, 들쭉날쭉하지 않은 모양
                # (작은 것은 차량·컨테이너, 들쭉날쭉한 것은 운동장·절토면 같은 오검출이 대부분)
                if not registered and not (area_m2 >= ML_KEEP_M2 and compact(op) >= 0.35):
                    dropped += 1
                    continue
                kept += 1
                kept_geoms.append(op)
                if registered:
                    name, floors, height, extra = attrs(uniq[best][1])
                    emit(f"{b['id'][:12]}-{k}", b["id"], poly, b["name"] or name, floors or b["floors"], height or b["height"],
                         uniq[best][1]["use"] == "02000" or b["class"] == "apartments",
                         "osm" if b["src"] == "OpenStreetMap" else "ml", {**extra, "reg": uniq[best][1]["id"]})
                else:
                    emit(f"{b['id'][:12]}-{k}", b["id"], poly, b["name"], b["floors"], b["height"],
                         b["class"] == "apartments", "osm" if b["src"] == "OpenStreetMap" else "ml", {"unreg": True})
        # 영상 윤곽과 거의 안 겹치는 대장 건물(영상에서 놓쳤거나 촬영 뒤 신축)은 대장 윤곽으로 넣는다.
        # 대장 윤곽은 8m 안팎 어긋나기도 해서, 그만큼 넓혀 30% 넘게 걸치면 이미 있는 건물로 본다
        kept_buf = unary_union(kept_geoms).buffer(reach) if kept_geoms else None
        added = 0
        for g, v in uniq:
            if kept_buf is not None and g.intersection(kept_buf).area >= 0.3 * g.area:
                continue
            added += 1
            name, floors, height, extra = attrs(v)
            for k, poly in enumerate(polys_of(v["geometry"])):
                emit(f"vw{v['id']}-{k}", v["id"], poly, name, floors, height, v["use"] == "02000", "vworld", {**extra, "reg": v["id"]})
        print(f"건축물대장 {len(uniq)}동(중복 {len(meta) - len(uniq)} 제외) 기준 · 영상 윤곽 {kept}동 사용, {dropped}동 버림 · 대장 윤곽만 있는 건물 {added}동 추가")
    else:
        for b in raw:
            for k, poly in enumerate(polys_of(b["geometry"])):
                emit(f"{b['id'][:12]}-{k}", b["id"], poly, b["name"], b["floors"], b["height"],
                     b["class"] == "apartments", "osm" if b["src"] == "OpenStreetMap" else "ml", {})
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
        "siteRing": [to_local(x, y) for x, y in SITE_RING],
        "siteEstimated": CFG.get("siteEstimated", True),
        "attribution": "자동 추출 건물 윤곽: Overture Maps Foundation (OpenStreetMap + 위성영상 기반 ML 윤곽 doi:10.5281/zenodo.8174931) · 도로/녹지: © OpenStreetMap contributors (ODbL) · 지형: Copernicus DEM GLO-30 © DLR/Airbus, ESA (AWS 공개 데이터)" + (" · 건물(건축물대장 GIS건물통합정보·도로명주소), 부지 경계: 브이월드(국토교통부)" if (CACHE / "vworld_bldginfo.json").exists() else ""),
        "terrain": terrain, "buildings": buildings, "roads": roads, "areas": areas, "pois": pois,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "scene.json"
    out.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("저장", out, f"{out.stat().st_size / 1024:.0f} KB")
    for name, empty in (("facilities.json", "{}\n"), ("overlays.json", "[]\n")):
        if not (OUT_DIR / name).exists():
            (OUT_DIR / name).write_text(empty, encoding="utf-8")
    write_site_index()


def write_site_index():
    """앱의 사업장 선택 메뉴용 목록: public/data/sites.json (장면이 만들어진 사업장만)"""
    items = []
    for p in sorted((ROOT / "sites").glob("*.json")):
        c = json.loads(p.read_text(encoding="utf-8"))
        if (ROOT / "public" / "data" / c["id"] / "scene.json").exists():
            items.append({"id": c["id"], "name": c["name"], "short": c.get("short", c["name"]), "companies": c.get("companies", [])})
    order = ["chungju", "gimcheon2", "magok"]
    items.sort(key=lambda x: order.index(x["id"]) if x["id"] in order else 99)
    (ROOT / "public" / "data" / "sites.json").write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if "--all" in sys.argv:
        import subprocess
        rest = [a for a in sys.argv[1:] if a != "--all"]
        for p in sorted((ROOT / "sites").glob("*.json")):
            print(f"===== {p.stem}")
            subprocess.run([sys.executable, __file__, "--site", p.stem, *rest], check=True)
    else:
        main()
