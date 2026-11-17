// 조작: 드론(자유 비행) · 보행(1인칭, 지형·건물 충돌) · 조감(궤도 회전)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { World } from './world';

export type Mode = 'drone' | 'walk' | 'orbit';

const EYE = 1.7;

export class Controls {
  mode: Mode = 'orbit';
  readonly pos = new THREE.Vector3();
  yaw = 0;   // 0 = 북쪽, 시계 방향이 +
  pitch = 0;
  speed = 0;
  readonly orbit: OrbitControls;
  private vel = new THREE.Vector3();
  private keys = new Set<string>();
  /** 터치 조이스틱 입력 (-1~1) */
  stick = { x: 0, y: 0, up: 0 };
  private tween: { from: THREE.Vector3; to: THREE.Vector3; yaw0: number; yaw1: number; p0: number; p1: number; t: number; dur: number } | null = null;
  onModeChange: (m: Mode) => void = () => {};

  constructor(readonly camera: THREE.PerspectiveCamera, readonly dom: HTMLElement, readonly world: World) {
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.minDistance = 30;
    this.orbit.maxDistance = 3500;
    this.orbit.zoomToCursor = true;

    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest?.('input,select,textarea')) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // 마우스: 포인터 잠금 중에는 움직임으로, 아니면 끌어서 시점 회전
    let dragging = false;
    dom.addEventListener('mousedown', (e) => { if (this.mode !== 'orbit' && e.button === 0) dragging = true; });
    addEventListener('mouseup', () => (dragging = false));
    addEventListener('mousemove', (e) => {
      if (this.mode === 'orbit') return;
      if (document.pointerLockElement === dom || dragging) this.look(e.movementX, e.movementY, 0.0022);
    });
    dom.addEventListener('wheel', (e) => {
      if (this.mode !== 'drone') return;
      e.preventDefault();
      this.pos.y = Math.max(this.pos.y - Math.sign(e.deltaY) * 6, this.floorAt(this.pos.x, -this.pos.z) + 2);
    }, { passive: false });

    // 터치: 화면 오른쪽 절반을 끌면 시점 회전 (왼쪽은 조이스틱이 맡음)
    let lookId = -1, lx = 0, ly = 0;
    dom.addEventListener('touchstart', (e) => {
      if (this.mode === 'orbit') return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (this.mode === 'orbit') return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== lookId) continue;
        this.look(t.clientX - lx, t.clientY - ly, 0.005);
        lx = t.clientX; ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
  }

  private look(dx: number, dy: number, k: number) {
    this.yaw += dx * k;
    this.pitch = Math.min(Math.max(this.pitch - dy * k, -1.5), 1.5);
  }

  lockPointer() {
    if (this.mode !== 'orbit' && matchMedia('(pointer: fine)').matches) this.dom.requestPointerLock?.();
  }

  /** 지면 또는 그 자리 건물 지붕의 해발 */
  private floorAt(x: number, n: number): number {
    const v = this.world.buildingAt(x, n);
    return v ? v.top : this.world.ground.heightAt(x, n);
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  setMode(m: Mode) {
    if (m === this.mode) return;
    const prev = this.mode;
    this.tween = null;
    if (prev === 'orbit') {
      // 조감에서 내려올 때: 보던 지점 근처에서 시작
      const t = this.orbit.target;
      const dir = new THREE.Vector3().subVectors(t, this.camera.position);
      this.yaw = Math.atan2(dir.x, -dir.z);
      if (m === 'drone') {
        const d = Math.min(this.camera.position.distanceTo(t), 220);
        this.pos.copy(t).addScaledVector(dir.normalize(), -d);
        this.pos.y = Math.max(this.pos.y, this.floorAt(this.pos.x, -this.pos.z) + 15);
        this.pitch = Math.asin(Math.min(Math.max(dir.y, -1), 1));
      } else {
        this.pos.set(t.x, 0, t.z);
        this.pitch = 0;
      }
    }
    if (m === 'walk') {
      this.freeSpot();
      this.pos.y = this.world.ground.heightAt(this.pos.x, -this.pos.z) + EYE;
      this.pitch = Math.max(this.pitch, -0.3);
    } else if (m === 'drone' && prev === 'walk') {
      this.pos.y += 25;
      this.pitch = -0.25;
    } else if (m === 'orbit') {
      const f = this.forward();
      const target = this.pos.clone().addScaledVector(f, 120);
      target.y = this.world.ground.heightAt(target.x, -target.z);
      this.orbit.target.copy(target);
      this.camera.position.copy(this.pos).addScaledVector(f, -150).setY(Math.max(this.pos.y, target.y) + 220);
      document.exitPointerLock?.();
    }
    this.vel.set(0, 0, 0);
    this.mode = m;
    this.orbit.enabled = m === 'orbit';
    this.onModeChange(m);
  }

  /** 건물 안에 서 있으면 가장 가까운 빈 곳으로 옮긴다 */
  private freeSpot() {
    if (!this.world.buildingAt(this.pos.x, -this.pos.z, 0.6)) return;
    for (let r = 3; r < 200; r += 3) {
      for (let a = 0; a < 16; a++) {
        const x = this.pos.x + Math.cos((a / 16) * 6.283) * r, z = this.pos.z + Math.sin((a / 16) * 6.283) * r;
        if (!this.world.buildingAt(x, -z, 0.6)) { this.pos.x = x; this.pos.z = z; return; }
      }
    }
  }

  /** 한 지점을 바라보는 위치로 부드럽게 이동 (시설 목록에서 고를 때) */
  flyTo(x: number, n: number, topY: number, size: number) {
    if (this.mode === 'orbit') {
      this.orbit.target.set(x, topY - 5, -n);
      const d = Math.max(size * 1.6, 90);
      this.camera.position.set(x + d * 0.6, topY + d * 0.7, -n + d * 0.8);
      return;
    }
    const d = this.mode === 'walk' ? Math.max(size * 0.8, 25) : Math.max(size * 1.3, 70);
    const to = new THREE.Vector3(x + d * 0.55, 0, -n + d * 0.83);
    if (this.mode === 'walk') {
      const keep = this.pos.clone();
      this.pos.copy(to); this.freeSpot(); to.copy(this.pos); this.pos.copy(keep);
      to.y = this.world.ground.heightAt(to.x, -to.z) + EYE;
    } else {
      to.y = topY + d * 0.45;
    }
    const dir = new THREE.Vector3(x - to.x, topY - 4 - to.y, -n - to.z);
    let yaw1 = Math.atan2(dir.x, -dir.z);
    while (yaw1 - this.yaw > Math.PI) yaw1 -= 2 * Math.PI;
    while (yaw1 - this.yaw < -Math.PI) yaw1 += 2 * Math.PI;
    const p1 = this.mode === 'walk' ? 0.1 : Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.tween = { from: this.pos.clone(), to, yaw0: this.yaw, yaw1, p0: this.pitch, p1, t: 0, dur: Math.min(1 + this.pos.distanceTo(to) / 400, 3) };
  }

  teleport(x: number, n: number) {
    this.tween = null;
    if (this.mode === 'orbit') {
      const d = new THREE.Vector3().subVectors(this.camera.position, this.orbit.target);
      this.orbit.target.set(x, this.world.ground.heightAt(x, n), -n);
      this.camera.position.copy(this.orbit.target).add(d);
      return;
    }
    const agl = this.pos.y - this.floorAt(this.pos.x, -this.pos.z);
    this.pos.x = x; this.pos.z = -n;
    if (this.mode === 'walk') { this.freeSpot(); this.pos.y = this.world.ground.heightAt(this.pos.x, -this.pos.z) + EYE; }
    else this.pos.y = this.floorAt(x, n) + Math.max(agl, 10);
  }

  update(dt: number) {
    if (this.mode === 'orbit') {
      this.orbit.update();
      // 지형 아래로 내려가지 않게
      const c = this.camera.position;
      const g = this.world.ground.heightAt(c.x, -c.z) + 3;
      if (c.y < g) c.y = g;
      this.pos.copy(c);
      this.speed = 0;
      return;
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(tw.t + dt / tw.dur, 1);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this.pos.lerpVectors(tw.from, tw.to, k);
      this.yaw = tw.yaw0 + (tw.yaw1 - tw.yaw0) * k;
      this.pitch = tw.p0 + (tw.p1 - tw.p0) * k;
      if (tw.t >= 1) this.tween = null;
      this.apply();
      return;
    }
    const K = this.keys;
    const ax = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) + this.stick.x;
    const az = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0) + this.stick.y;
    const ay = (K.has('KeyE') || K.has('Space') ? 1 : 0) - (K.has('KeyQ') || K.has('KeyC') ? 1 : 0) + this.stick.up;
    const boost = K.has('ShiftLeft') || K.has('ShiftRight');
    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3().addScaledVector(f, az).addScaledVector(r, ax);
    if (want.lengthSq() > 1) want.normalize();

    if (this.mode === 'drone') {
      const agl = this.pos.y - this.world.ground.heightAt(this.pos.x, -this.pos.z);
      const top = (boost ? 90 : 28) * Math.min(Math.max(agl / 60, 1), 2.5); // 높이 날수록 빠르게
      want.multiplyScalar(top);
      want.y = ay * (boost ? 30 : 14);
      this.vel.lerp(want, 1 - Math.exp(-dt * 3.5)); // 관성 있는 드론 느낌
      this.pos.addScaledVector(this.vel, dt);
      const lim = this.world.data.halfExtentM - 5;
      this.pos.x = Math.min(Math.max(this.pos.x, -lim), lim);
      this.pos.z = Math.min(Math.max(this.pos.z, -lim), lim);
      const floor = this.floorAt(this.pos.x, -this.pos.z) + 2;
      if (this.pos.y < floor) { this.pos.y += (floor - this.pos.y) * Math.min(dt * 10, 1); this.vel.y = Math.max(this.vel.y, 0); }
      this.pos.y = Math.min(this.pos.y, this.world.ground.maxH + 900);
    } else {
      want.multiplyScalar(boost ? 12 : 4.5);
      this.vel.lerp(want, 1 - Math.exp(-dt * 10));
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      const lim = this.world.data.halfExtentM - 5;
      const ok = (x: number, z: number) => Math.abs(x) < lim && Math.abs(z) < lim && !this.world.buildingAt(x, -z, 0.6);
      if (ok(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (ok(nx, this.pos.z)) { this.pos.x = nx; this.vel.z = 0; }   // 벽을 따라 미끄러지기
      else if (ok(this.pos.x, nz)) { this.pos.z = nz; this.vel.x = 0; }
      else this.vel.set(0, 0, 0);
      const y = this.world.ground.heightAt(this.pos.x, -this.pos.z) + EYE;
      this.pos.y += (y - this.pos.y) * Math.min(dt * 12, 1);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.apply();
  }

  private apply() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
  }

  /** 나침반 방위 (도, 북=0, 동=90) */
  heading(): number {
    if (this.mode === 'orbit') {
      const d = new THREE.Vector3().subVectors(this.orbit.target, this.camera.position);
      return ((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360;
    }
    return (((this.yaw * 180) / Math.PI) % 360 + 360) % 360;
  }
}
