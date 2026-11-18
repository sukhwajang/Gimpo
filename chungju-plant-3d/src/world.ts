// 3D 장면: 지형, 건물, 나무, 하늘·조명
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Ground } from './ground';
import { centroid, pointInRing, transformRings, type Building, type FacilityStore, type Overlay, type Pt, type SceneData } from './data';

export interface BuildingView {
  b: Building;
  mesh: THREE.Mesh;
  base: number;   // 바닥 해발
  top: number;    // 지붕 해발
  center: [number, number]; // [x, 북쪽]
  minX: number; maxX: number; minN: number; maxN: number;
  ring: Pt[];       // 이동·회전·크기 조정이 반영된 윤곽
  holes: Pt[][];
  deleted: boolean; // 사용자가 지운 건물
  overlayHidden: boolean; // 실사 모델로 대체되어 숨긴 건물
}

function facadeTexture(kind: 'panel' | 'windows'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2f0';
  g.fillRect(0, 0, 128, 128);
  if (kind === 'panel') {
    // 샌드위치 패널 골과 띠창
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0; x < 128; x += 8) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 128); g.stroke(); }
    g.fillStyle = 'rgba(40,60,80,0.55)';
    g.fillRect(10, 44, 44, 16); g.fillRect(74, 44, 44, 16);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 120, 128, 8);
  } else {
    g.fillStyle = 'rgba(45,62,82,0.62)';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 32 + 6, y * 32 + 8, 20, 15);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly ground: Ground;
  readonly views: BuildingView[] = [];
  readonly sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  private groundTex: THREE.CanvasTexture;
  private terrainMesh!: THREE.Mesh;
  private grid = new Map<string, BuildingView[]>();
  private readonly cell = 60;
  private mats!: Record<string, THREE.Material[]>;
  private selBox: THREE.LineSegments | null = null;

  constructor(readonly data: SceneData, readonly store: FacilityStore, texSize: number) {
    this.ground = new Ground(data, texSize);
    this.groundTex = new THREE.CanvasTexture(this.ground.canvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = 8;
    this.buildSky();
    this.buildTerrain();
    this.buildMaterials();
    for (const b of data.buildings) this.addBuilding(b);
    this.buildTrees();
  }

  refreshGroundTexture() { this.groundTex.needsUpdate = true; }

  private buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(145));
    u.sunPosition.value.copy(sunDir);
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xcfdbe6, 900, 5200);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x77705e, 1.25));
    this.sun.position.copy(sunDir).multiplyScalar(1500);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -380; sc.right = sc.top = 380; sc.near = 100; sc.far = 4000;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
  }

  /** 그림자 범위를 보는 곳 주변으로 옮긴다 */
  updateShadow(focus: THREE.Vector3) {
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    const snap = 20;
    this.sun.target.position.set(Math.round(focus.x / snap) * snap, focus.y, Math.round(focus.z / snap) * snap);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 1500);
  }

  private buildTerrain() {
    const t = this.data.terrain;
    const n = t.size;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = t.minX + i * t.cellM;
        pos[k * 3 + 1] = t.heights[k];
        pos[k * 3 + 2] = -(t.minY + j * t.cellM);
        uv[k * 2] = i / (n - 1);
        uv[k * 2 + 1] = j / (n - 1);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.terrainMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1, metalness: 0 }));
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
    // 지도 바깥은 안개 색 평면으로 막아 가장자리가 허공으로 보이지 않게 한다
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshBasicMaterial({ color: 0x8f9a86 }));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = this.ground.minH - 2;
    this.scene.add(skirt);
  }

  private buildMaterials() {
    const panel = facadeTexture('panel');
    panel.repeat.set(1 / 12, 1 / 6);
    const win = facadeTexture('windows');
    win.repeat.set(1 / 11.6, 1 / 11.6);
    const mk = (wall: number, roof: number, map: THREE.Texture | null) => [
      new THREE.MeshStandardMaterial({ color: roof, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: wall, roughness: 0.85, map }),
    ];
    this.mats = {
      site: mk(0xffffff, 0xc9d6e2, panel),
      industrial: mk(0xcfc9bb, 0xa7aab0, panel),
      apartment: mk(0xe6e1d6, 0x9b9a96, win),
      small: mk(0xcfc7b8, 0x8d857b, null),
    };
  }

  private matFor(b: Building): THREE.Material[] {
    const site = this.store.get(b.id).site ?? b.site;
    return this.mats[site ? 'site' : b.kind];
  }

  isSite(b: Building) { return this.store.get(b.id).site ?? b.site; }
  isDeleted(b: Building) { return !!this.store.get(b.id).deleted; }
  heightOf(b: Building) { return this.store.get(b.id).h ?? b.h; }

  private makeGeometry(v: { ring: Pt[]; holes: Pt[][] }, base: number, top: number): THREE.BufferGeometry {
    const shape = new THREE.Shape(v.ring.map(([x, n]) => new THREE.Vector2(x, n)));
    for (const h of v.holes) shape.holes.push(new THREE.Path(h.map(([x, n]) => new THREE.Vector2(x, n))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: top - base, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // (x, 북, 위) -> (x, 위, -북)
    g.translate(0, base, 0);
    return g;
  }

  private addBuilding(b: Building) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.matFor(b));
    mesh.castShadow = mesh.receiveShadow = true;
    const v: BuildingView = {
      b, mesh, base: 0, top: 0, center: [0, 0], minX: 0, maxX: 0, minN: 0, maxN: 0,
      ring: b.ring, holes: b.holes, deleted: false, overlayHidden: false,
    };
    mesh.userData.view = v;
    this.scene.add(mesh);
    this.views.push(v);
    this.rebuild(v);
  }

  private gridKeys(v: BuildingView): string[] {
    const keys: string[] = [];
    for (let cx = Math.floor(v.minX / this.cell); cx <= Math.floor(v.maxX / this.cell); cx++)
      for (let cn = Math.floor(v.minN / this.cell); cn <= Math.floor(v.maxN / this.cell); cn++) keys.push(cx + ',' + cn);
    return keys;
  }

  /** 높이·부지 여부·윤곽(이동·회전·크기)·삭제 여부가 바뀐 건물을 다시 만든다 */
  rebuild(v: BuildingView) {
    for (const k of this.gridKeys(v)) {
      const list = this.grid.get(k);
      if (list) { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); }
    }
    const o = this.store.get(v.b.id);
    const { ring, holes } = transformRings(v.b, o);
    let lo = Infinity, hi = -Infinity, minX = Infinity, maxX = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const [x, n] of ring) {
      const h = this.ground.heightAt(x, n);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minN = Math.min(minN, n); maxN = Math.max(maxN, n);
    }
    Object.assign(v, { ring, holes, minX, maxX, minN, maxN, center: centroid(ring), base: lo - 1, top: hi + this.heightOf(v.b) });
    v.deleted = !!o.deleted;
    v.mesh.geometry.dispose();
    v.mesh.geometry = this.makeGeometry(v, v.base, v.top);
    v.mesh.material = this.matFor(v.b);
    v.mesh.visible = !v.deleted && !v.overlayHidden;
    for (const k of this.gridKeys(v)) {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(v);
    }
    if (this.selBox && this.selBox.userData.view === v) this.select(v);
  }

  /** (x, 북) 지점을 덮는 건물 (보행 충돌·드론 지붕 판정용) */
  buildingAt(x: number, n: number, margin = 0): BuildingView | null {
    const list = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(n / this.cell));
    if (!list) return null;
    for (const v of list) {
      if (!v.mesh.visible) continue;
      if (x < v.minX - margin || x > v.maxX + margin || n < v.minN - margin || n > v.maxN + margin) continue;
      if (pointInRing(x, n, v.ring)) return v;
      if (margin > 0) {
        for (const [dx, dn] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
          if (pointInRing(x + dx, n + dn, v.ring)) return v;
        }
      }
    }
    return null;
  }

  select(v: BuildingView | null) {
    if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); this.selBox = null; }
    if (!v) return;
    const edges = new THREE.EdgesGeometry(v.mesh.geometry, 30);
    this.selBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffb000 }));
    this.selBox.renderOrder = 10;
    this.selBox.userData.view = v;
    this.scene.add(this.selBox);
  }

  private buildTrees() {
    const pts: number[] = [];
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const step = 11, half = this.data.halfExtentM;
    for (let x = -half; x < half; x += step) {
      for (let n = -half; n < half; n += step) {
        const px = x + rnd() * step, pn = n + rnd() * step;
        if (rnd() < 0.72 && this.ground.treeAllowed(px, pn)) pts.push(px, pn, 0.7 + rnd() * 0.7);
      }
    }
    const count = pts.length / 3;
    const crown = new THREE.ConeGeometry(3.2, 9, 6);
    crown.translate(0, 7, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.45, 3, 5);
    trunk.translate(0, 1.5, 0);
    const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), count);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = pts[i * 3], n = pts[i * 3 + 1], s = pts[i * 3 + 2];
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
      m.compose(new THREE.Vector3(x, this.ground.heightAt(x, n) - 0.3, -n), q, new THREE.Vector3(s, s * (0.85 + rnd() * 0.4), s));
      crowns.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
      crowns.setColorAt(i, col.setHSL(0.27 + rnd() * 0.06, 0.38 + rnd() * 0.12, 0.2 + rnd() * 0.09));
    }
    crowns.castShadow = true;
    this.scene.add(crowns, trunks);
  }

  /** 실사 모델(glTF/GLB)을 좌표에 맞춰 얹고, 대체되는 상자 건물은 숨긴다 */
  async addOverlays(list: Overlay[]) {
    if (!list.length) return;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    for (const o of list) {
      try {
        const gltf = await loader.loadAsync(o.url);
        const x = (o.lon - this.data.origin.lon) * this.data.mPerDegLon;
        const n = (o.lat - this.data.origin.lat) * this.data.mPerDegLat;
        gltf.scene.position.set(x, this.ground.heightAt(x, n) + (o.altOffsetM ?? 0), -n);
        gltf.scene.rotation.y = -THREE.MathUtils.degToRad(o.headingDeg ?? 0);
        gltf.scene.scale.setScalar(o.scale ?? 1);
        gltf.scene.traverse((c) => { c.castShadow = c.receiveShadow = true; });
        this.scene.add(gltf.scene);
        for (const id of o.hideBuildingIds ?? []) {
          const v = this.views.find((w) => w.b.id === id);
          if (v) { v.overlayHidden = true; v.mesh.visible = false; }
        }
      } catch (e) {
        console.warn('실사 모델을 불러오지 못했습니다:', o.url, e);
      }
    }
  }
}
