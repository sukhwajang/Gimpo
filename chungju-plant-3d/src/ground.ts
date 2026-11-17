// 지형 높이 조회와 지면 그림(도로·녹지를 캔버스에 그려 지형에 입힘). 항공사진도 같은 캔버스에 그린다.
import type { SceneData, Pt } from './data';

export class Ground {
  readonly half: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly pxPerM: number;
  /** 나무를 심을 수 있는 곳 판정용 저해상도 마스크 (R: 막힘, G: 숲) */
  private mask!: ImageData;
  private maskPxPerM = 0.25;
  minH = Infinity;
  maxH = -Infinity;

  constructor(readonly data: SceneData, texSize: number) {
    this.half = data.halfExtentM;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = texSize;
    this.ctx = this.canvas.getContext('2d')!;
    this.pxPerM = texSize / (2 * this.half);
    for (const h of data.terrain.heights) {
      if (h < this.minH) this.minH = h;
      if (h > this.maxH) this.maxH = h;
    }
    this.buildMask();
    this.paintMap();
  }

  /** (동쪽 x, 북쪽 n) 위치의 해발 높이 m */
  heightAt(x: number, n: number): number {
    const t = this.data.terrain;
    const fx = Math.min(Math.max((x - t.minX) / t.cellM, 0), t.size - 1.001);
    const fy = Math.min(Math.max((n - t.minY) / t.cellM, 0), t.size - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const h = t.heights, s = t.size;
    return (h[j * s + i] * (1 - tx) + h[j * s + i + 1] * tx) * (1 - ty) +
      (h[(j + 1) * s + i] * (1 - tx) + h[(j + 1) * s + i + 1] * tx) * ty;
  }

  slopeAt(x: number, n: number): number {
    const d = this.data.terrain.cellM;
    const dx = this.heightAt(x + d, n) - this.heightAt(x - d, n);
    const dn = this.heightAt(x, n + d) - this.heightAt(x, n - d);
    return Math.hypot(dx, dn) / (2 * d);
  }

  /** 나무를 심어도 되는 곳인가 (숲으로 표시됐거나 비탈이고, 도로·건물·단지가 아님) */
  treeAllowed(x: number, n: number): boolean {
    const w = this.mask.width;
    const px = Math.floor((x + this.half) * this.maskPxPerM);
    const py = Math.floor((this.half - n) * this.maskPxPerM);
    if (px < 0 || py < 0 || px >= w || py >= w) return false;
    const k = (py * w + px) * 4;
    if (this.mask.data[k] > 100) return false;
    return this.mask.data[k + 1] > 100 || this.slopeAt(x, n) > 0.16;
  }

  private path(ctx: CanvasRenderingContext2D, pts: Pt[], s: number, close: boolean) {
    ctx.beginPath();
    pts.forEach(([x, n], i) => {
      const px = (x + this.half) * s, py = (this.half - n) * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    if (close) ctx.closePath();
  }

  private buildMask() {
    const size = Math.round(2 * this.half * this.maskPxPerM);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const s = this.maskPxPerM;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0f0';
    for (const a of this.data.areas) if (a.kind === 'wood') { this.path(ctx, a.ring, s, true); ctx.fill(); }
    ctx.fillStyle = ctx.strokeStyle = '#f00';
    for (const a of this.data.areas) {
      if (a.kind === 'wood' || a.kind === 'green') continue;
      this.path(ctx, a.ring, s, true); ctx.fill();
    }
    this.path(ctx, this.data.siteRing, s, true); ctx.fill();
    ctx.lineCap = 'round';
    for (const r of this.data.roads) { ctx.lineWidth = (r.w + 6) * s; this.path(ctx, r.pts, s, false); ctx.stroke(); }
    ctx.lineWidth = 10 * s;
    for (const b of this.data.buildings) { this.path(ctx, b.ring, s, true); ctx.fill(); ctx.stroke(); }
    this.mask = ctx.getImageData(0, 0, size, size);
  }

  /** 기본 지면 그림: 경사에 따른 바탕색 + 용도 구역 + 도로 */
  paintMap() {
    const { ctx, canvas } = this;
    const s = this.pxPerM;
    const t = this.data.terrain;
    // 바탕: 평지는 밝은 흙·풀색, 비탈은 숲색
    const base = document.createElement('canvas');
    base.width = base.height = t.size;
    const bctx = base.getContext('2d')!;
    const img = bctx.createImageData(t.size, t.size);
    for (let j = 0; j < t.size; j++) {
      for (let i = 0; i < t.size; i++) {
        const x = t.minX + i * t.cellM, n = t.minY + j * t.cellM;
        const k = Math.min(Math.max((this.slopeAt(x, n) - 0.07) / 0.14, 0), 1);
        const m = k * k * (3 - 2 * k);
        const o = ((t.size - 1 - j) * t.size + i) * 4;
        img.data[o] = 168 + (74 - 168) * m;
        img.data[o + 1] = 176 + (104 - 176) * m;
        img.data[o + 2] = 140 + (66 - 140) * m;
        img.data[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

    const fills: Record<string, string> = {
      industrial: '#bdbbb1', residential: '#c6c0b0', commercial: '#c4bcae', green: '#8eae6c',
      wood: '#557548', water: '#6f9fc4', parking: '#9c9b96',
    };
    for (const kind of ['industrial', 'residential', 'commercial', 'green', 'wood', 'water', 'parking']) {
      ctx.fillStyle = fills[kind];
      for (const a of this.data.areas) if (a.kind === kind) { this.path(ctx, a.ring, s, true); ctx.fill(); }
    }
    // 건물 둘레 포장면
    ctx.fillStyle = ctx.strokeStyle = '#b3b1a8';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9 * s;
    for (const b of this.data.buildings) if (b.kind !== 'small') { this.path(ctx, b.ring, s, true); ctx.fill(); ctx.stroke(); }
    this.paintRoads();
    this.paintSiteOutline();
  }

  private paintRoads() {
    const { ctx } = this;
    const s = this.pxPerM;
    ctx.lineCap = ctx.lineJoin = 'round';
    const roads = this.data.roads.filter((r) => !r.tunnel).sort((a, b) => a.w - b.w);
    for (const r of roads) { // 가장자리(보도·연석)
      if (r.w < 4) continue;
      ctx.strokeStyle = '#d2d0c8'; ctx.lineWidth = (r.w + 3) * s; this.path(ctx, r.pts, s, false); ctx.stroke();
    }
    for (const r of roads) {
      const foot = r.w < 4;
      ctx.strokeStyle = foot ? '#cfc8b4' : '#55585c';
      ctx.lineWidth = r.w * s; this.path(ctx, r.pts, s, false); ctx.stroke();
    }
    ctx.setLineDash([3 * s, 5 * s]);
    ctx.strokeStyle = '#e9e4c8'; ctx.lineWidth = Math.max(0.25 * s, 0.6);
    for (const r of roads) if (r.w >= 7) { this.path(ctx, r.pts, s, false); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  private paintSiteOutline() {
    const { ctx } = this;
    const s = this.pxPerM;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 1.2 * s;
    this.path(ctx, this.data.siteRing, s, true); ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * 브이월드 항공사진 타일을 지면에 입힌다. 2.4km 범위에서는 메르카토르 왜곡이 무시할 만해서
   * 타일을 그대로 직사각형으로 그린다. 성공하면 true.
   */
  async paintAerial(key: string, onProgress: (done: number, total: number) => void): Promise<boolean> {
    const d = this.data;
    const jobs: { z: number; x: number; y: number }[] = [];
    const add = (z: number, halfM: number) => {
      const n = 2 ** z;
      const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
      const ty = (lat: number) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      const w = d.origin.lon - halfM / d.mPerDegLon, e = d.origin.lon + halfM / d.mPerDegLon;
      const so = d.origin.lat - halfM / d.mPerDegLat, no = d.origin.lat + halfM / d.mPerDegLat;
      for (let x = tx(w); x <= tx(e); x++) for (let y = ty(no); y <= ty(so); y++) jobs.push({ z, x, y });
    };
    add(17, this.half); // 전체
    add(18, 450);       // 공장 주변은 한 단계 더 선명하게 (나중에 그려져 위에 덮임)
    const load = (j: { z: number; x: number; y: number }) =>
      new Promise<HTMLImageElement | null>((res) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/Satellite/${j.z}/${j.y}/${j.x}.jpeg`;
      });
    if (!(await load(jobs[0]))) return false; // 키·서비스 URL 문제면 바로 포기
    let done = 0;
    const draw = (j: { z: number; x: number; y: number }, im: HTMLImageElement) => {
      const n = 2 ** j.z;
      const lon = (x: number) => (x / n) * 360 - 180;
      const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
      const x0 = ((lon(j.x) - d.origin.lon) * d.mPerDegLon + this.half) * this.pxPerM;
      const x1 = ((lon(j.x + 1) - d.origin.lon) * d.mPerDegLon + this.half) * this.pxPerM;
      const y0 = (this.half - (lat(j.y) - d.origin.lat) * d.mPerDegLat) * this.pxPerM;
      const y1 = (this.half - (lat(j.y + 1) - d.origin.lat) * d.mPerDegLat) * this.pxPerM;
      this.ctx.drawImage(im, x0, y0, x1 - x0 + 0.5, y1 - y0 + 0.5);
    };
    for (let i = 0; i < jobs.length; i += 8) {
      const batch = jobs.slice(i, i + 8);
      const imgs = await Promise.all(batch.map(load));
      imgs.forEach((im, k) => im && draw(batch[k], im));
      done += batch.length;
      onProgress(done, jobs.length);
    }
    this.paintSiteOutline();
    return true;
  }
}
