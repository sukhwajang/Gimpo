import * as THREE from 'three';
import { Controls, type Mode } from './controls';
import { FacilityStore, USES, displayName, loadJson, type Overlay, type Overrides, type SceneData } from './data';
import { World, type BuildingView } from './world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY_LS = 'plant3d.vworldKey';
const isTouch = matchMedia('(pointer: coarse)').matches;

async function start() {
  const data = await loadJson<SceneData | null>('./data/scene.json', null);
  if (!data) {
    $('loading').textContent = '장면 데이터(public/data/scene.json)를 찾지 못했습니다. `npm run data` 로 먼저 만들어 주세요.';
    return;
  }
  const store = new FacilityStore(await loadJson<Overrides>('./data/facilities.json', {}));

  const canvas = $<HTMLCanvasElement>('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const texSize = Math.min(renderer.capabilities.maxTextureSize, isTouch ? 2048 : 4096);

  const world = new World(data, store, texSize);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 12000);
  const controls = new Controls(camera, canvas, world);

  // 시작 화면: 공장 부지를 남동쪽 위에서 내려다본다
  const g0 = world.ground.heightAt(0, 0);
  controls.orbit.target.set(0, g0, 0);
  camera.position.set(330, g0 + 360, 460);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  document.body.classList.toggle('touch', isTouch);
  $('t-name').textContent = data.name + ' 3D 지도';
  $('t-addr').textContent = data.address;
  $('t-badge').hidden = !data.siteEstimated;
  $('attrib').textContent = data.attribution;
  document.title = data.name + ' 3D 지도';

  // ---------- 알림 ----------
  let toastTimer = 0;
  const toast = (msg: string, ms = 3500) => {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    if (ms) toastTimer = window.setTimeout(() => (t.style.display = 'none'), ms);
  };

  // ---------- 보기 방식 ----------
  const helpText: Record<Mode, string> = {
    orbit: '끌어서 회전 · 휠로 확대 · 오른쪽 끌기로 이동 · 건물을 누르면 정보',
    drone: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 · <kbd>E</kbd>/<kbd>Q</kbd> 상승·하강 · <kbd>Shift</kbd> 빠르게 · 끌어서 둘러보기 · <kbd>F</kbd> 마우스 고정',
    walk: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 걷기 · <kbd>Shift</kbd> 달리기 · 끌어서 둘러보기 · <kbd>F</kbd> 마우스 고정',
  };
  let helpTimer = 0;
  const showMode = (m: Mode) => {
    document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    document.body.classList.toggle('moving', m !== 'orbit');
    document.body.classList.toggle('drone', m === 'drone');
    const h = $('help');
    h.innerHTML = helpText[m];
    h.style.opacity = '1';
    clearTimeout(helpTimer);
    helpTimer = window.setTimeout(() => (h.style.opacity = '0'), 9000);
  };
  controls.onModeChange = showMode;
  showMode('orbit');
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) =>
    b.addEventListener('click', () => { controls.setMode(b.dataset.mode as Mode); canvas.focus(); }));
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input,select')) return;
    if (e.code === 'Digit1') controls.setMode('orbit');
    if (e.code === 'Digit2') controls.setMode('drone');
    if (e.code === 'Digit3') controls.setMode('walk');
    if (e.code === 'KeyF') { if (document.pointerLockElement) document.exitPointerLock(); else controls.lockPointer(); }
  });
  document.addEventListener('pointerlockchange', () => {
    $('cross').style.display = document.pointerLockElement ? 'block' : 'none';
  });

  // ---------- 시설 목록 ----------
  let selected: BuildingView | null = null;
  const nameOf = (v: BuildingView) => displayName(v.b, store.get(v.b.id));
  const sizeOf = (v: BuildingView) => Math.max(v.maxX - v.minX, v.maxN - v.minN);
  const goTo = (v: BuildingView) => controls.flyTo(v.center[0], v.center[1], v.top, sizeOf(v));

  const renderList = () => {
    const list = $('fac-list');
    list.textContent = '';
    const site = world.views.filter((v) => world.isSite(v.b)).sort((a, b) => b.b.area - a.b.area);
    const named = world.views.filter((v) => !world.isSite(v.b) && (v.b.name || store.get(v.b.id).name) && v.b.kind !== 'apartment');
    $('fac-count').textContent = `${site.length}동`;
    const add = (title: string, arr: BuildingView[], dot: boolean) => {
      if (!arr.length) return;
      const g = document.createElement('div');
      g.className = 'group';
      g.textContent = title;
      list.append(g);
      for (const v of arr) {
        const o = store.get(v.b.id);
        const btn = document.createElement('button');
        btn.className = 'fac' + (v === selected ? ' sel' : '');
        const n = document.createElement('span'); n.className = 'n'; n.textContent = nameOf(v);
        const m = document.createElement('span'); m.className = 'm';
        m.textContent = (o.use && o.use !== USES[0] ? o.use + ' · ' : '') + `${v.b.area.toLocaleString()}㎡`;
        if (dot) { const d = document.createElement('span'); d.className = 'dot'; btn.append(d); }
        btn.append(n, m);
        btn.addEventListener('click', () => { select(v); goTo(v); });
        list.append(btn);
      }
    };
    add('공장 부지 내 시설', site, true);
    add('주변 업체', named, false);
  };

  // ---------- 선택·편집 ----------
  const useSel = $<HTMLSelectElement>('i-use');
  for (const u of USES) useSel.add(new Option(u, u));
  const select = (v: BuildingView | null) => {
    selected = v;
    world.select(v);
    $('info').classList.toggle('on', !!v);
    if (v) {
      const o = store.get(v.b.id);
      $('i-title').textContent = nameOf(v);
      $<HTMLInputElement>('i-name').value = o.name ?? v.b.name ?? '';
      useSel.value = o.use ?? USES[0];
      $<HTMLInputElement>('i-h').value = String(world.heightOf(v.b));
      $<HTMLInputElement>('i-memo').value = o.memo ?? '';
      $<HTMLInputElement>('i-site').checked = world.isSite(v.b);
      const src = { osm: 'OpenStreetMap', ml: '위성영상 자동 추출 윤곽', vworld: '브이월드' }[v.b.src];
      $('i-meta').textContent = `바닥 면적 약 ${v.b.area.toLocaleString()}㎡ · 윤곽 출처: ${src}` +
        (v.b.hEst && store.get(v.b.id).h == null ? ' · 높이는 면적으로 어림한 값이라 실제와 다를 수 있습니다.' : '');
    }
    renderList();
  };
  const edit = (patch: Parameters<FacilityStore['set']>[1], rebuild = false) => {
    if (!selected) return;
    store.set(selected.b.id, patch);
    if (rebuild) world.rebuild(selected);
    $('i-title').textContent = nameOf(selected);
    renderList();
    refreshLabels();
  };
  $<HTMLInputElement>('i-name').addEventListener('input', (e) => edit({ name: (e.target as HTMLInputElement).value.trim() || undefined }));
  useSel.addEventListener('change', () => edit({ use: useSel.value }));
  $<HTMLInputElement>('i-memo').addEventListener('input', (e) => edit({ memo: (e.target as HTMLInputElement).value }));
  $<HTMLInputElement>('i-h').addEventListener('change', (e) => {
    const h = Number((e.target as HTMLInputElement).value);
    if (h >= 2 && h <= 200) edit({ h }, true);
  });
  $<HTMLInputElement>('i-site').addEventListener('change', (e) => edit({ site: (e.target as HTMLInputElement).checked }, true));
  $('i-close').addEventListener('click', () => select(null));
  $('i-go').addEventListener('click', () => selected && goTo(selected));

  // 클릭으로 건물 고르기 (끌기와 구분)
  const ray = new THREE.Raycaster();
  let downAt: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 6) return;
    const locked = document.pointerLockElement === canvas;
    const p = locked ? new THREE.Vector2(0, 0) : new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hit = ray.intersectObjects(world.views.filter((v) => v.mesh.visible).map((v) => v.mesh), false)[0];
    select(hit ? (hit.object.userData.view as BuildingView) : null);
  });

  // ---------- 이름표 ----------
  const labelBox = $('labels');
  type Label = { el: HTMLDivElement; pos: THREE.Vector3; far: number };
  let labels: Label[] = [];
  const refreshLabels = () => {
    labelBox.textContent = '';
    labels = [];
    for (const v of world.views) {
      const site = world.isSite(v.b);
      const o = store.get(v.b.id);
      if (!site && !v.b.name && !o.name) continue;
      if (v.b.kind === 'apartment' && !o.name) continue;
      if (site && v.b.area < 100 && !o.name) continue; // 작은 부속 건물은 이름을 붙였을 때만
      const el = document.createElement('div');
      el.className = 'lbl' + (site ? ' site' : '');
      el.textContent = nameOf(v);
      labelBox.append(el);
      labels.push({ el, pos: new THREE.Vector3(v.center[0], v.top + 4, -v.center[1]), far: site ? 2500 : 900 });
    }
    const seen = new Set<string>();
    for (const r of data.roads) {
      if (!r.name || seen.has(r.name) || r.w < 6) continue;
      seen.add(r.name);
      const [x, n] = r.pts[Math.floor(r.pts.length / 2)];
      const el = document.createElement('div');
      el.className = 'lbl road';
      el.textContent = r.name;
      labelBox.append(el);
      labels.push({ el, pos: new THREE.Vector3(x, world.ground.heightAt(x, n) + 3, -n), far: 500 });
    }
  };
  const tmp = new THREE.Vector3();
  const updateLabels = () => {
    for (const l of labels) {
      const d = l.pos.distanceTo(camera.position);
      tmp.copy(l.pos).project(camera);
      if (d > l.far || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      l.el.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2) * innerWidth}px,${((1 - tmp.y) / 2) * innerHeight}px)`;
    }
  };
  $<HTMLInputElement>('opt-labels').addEventListener('change', (e) => (labelBox.style.display = (e.target as HTMLInputElement).checked ? '' : 'none'));

  // ---------- 미니맵 ----------
  const mini = $('mini').querySelector('canvas')!;
  const mctx = mini.getContext('2d')!;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = 2048;
  const composeMap = () => {
    const c = mapCanvas.getContext('2d')!;
    const s = mapCanvas.width / (2 * data.halfExtentM);
    c.drawImage(world.ground.canvas, 0, 0, mapCanvas.width, mapCanvas.height);
    for (const v of world.views) {
      c.beginPath();
      v.b.ring.forEach(([x, n], i) => (i ? c.lineTo((x + data.halfExtentM) * s, (data.halfExtentM - n) * s) : c.moveTo((x + data.halfExtentM) * s, (data.halfExtentM - n) * s)));
      c.closePath();
      c.fillStyle = world.isSite(v.b) ? '#ffb000' : '#f4f1ea';
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1;
      c.fill();
      c.stroke();
    }
  };
  const MINI_SPAN = 700; // 미니맵에 보이는 폭(m)
  const miniCenter = (): [number, number] =>
    controls.mode === 'orbit' ? [controls.orbit.target.x, -controls.orbit.target.z] : [controls.pos.x, -controls.pos.z];
  const drawMini = () => {
    const [cx, cn] = miniCenter();
    const s = mapCanvas.width / (2 * data.halfExtentM);
    const W = mini.width;
    mctx.fillStyle = '#8f9a86';
    mctx.fillRect(0, 0, W, W);
    mctx.drawImage(mapCanvas, (cx + data.halfExtentM - MINI_SPAN / 2) * s, (data.halfExtentM - cn - MINI_SPAN / 2) * s, MINI_SPAN * s, MINI_SPAN * s, 0, 0, W, W);
    const px = controls.pos.x, pn = -controls.pos.z;
    const mx = W / 2 + ((px - cx) / MINI_SPAN) * W, my = W / 2 - ((pn - cn) / MINI_SPAN) * W;
    mctx.save();
    mctx.translate(mx, my);
    mctx.rotate((controls.heading() * Math.PI) / 180);
    mctx.beginPath();
    mctx.moveTo(0, -16); mctx.lineTo(11, 12); mctx.lineTo(0, 6); mctx.lineTo(-11, 12);
    mctx.closePath();
    mctx.fillStyle = '#e5352b'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 3;
    mctx.stroke(); mctx.fill();
    mctx.restore();
    mctx.fillStyle = '#fff'; mctx.font = 'bold 22px sans-serif'; mctx.textAlign = 'center';
    mctx.shadowColor = '#000'; mctx.shadowBlur = 4;
    mctx.fillText('N', W / 2, 26);
    mctx.shadowBlur = 0;
  };
  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect();
    const [cx, cn] = miniCenter();
    controls.teleport(cx + ((e.clientX - r.left) / r.width - 0.5) * MINI_SPAN, cn - ((e.clientY - r.top) / r.height - 0.5) * MINI_SPAN);
  });

  // ---------- 설정: 항공사진, 내보내기 ----------
  const keyInput = $<HTMLInputElement>('opt-key');
  const aerial = $<HTMLInputElement>('opt-aerial');
  // .env.local 의 VITE_VWORLD_KEY 가 있으면 기본값으로 쓴다 (키는 저장소에 커밋하지 않음)
  const envKey = (import.meta.env.VITE_VWORLD_KEY as string | undefined) ?? '';
  try { keyInput.value = localStorage.getItem(KEY_LS) || envKey; } catch { keyInput.value = envKey; }
  keyInput.addEventListener('change', () => { try { localStorage.setItem(KEY_LS, keyInput.value.trim()); } catch { /* 무시 */ } });
  aerial.addEventListener('change', async () => {
    if (!aerial.checked) {
      world.ground.paintMap();
      world.refreshGroundTexture();
      composeMap();
      return;
    }
    const key = keyInput.value.trim();
    if (!key) { aerial.checked = false; toast('브이월드 API 키를 먼저 넣어 주세요.'); return; }
    aerial.disabled = true;
    const ok = await world.ground.paintAerial(key, (d, t) => { toast(`항공사진 불러오는 중 ${d}/${t}`, 0); world.refreshGroundTexture(); });
    aerial.disabled = false;
    if (!ok) {
      aerial.checked = false;
      toast('항공사진을 불러오지 못했습니다. 키와, 브이월드에 등록한 서비스 URL이 이 주소와 맞는지 확인해 주세요.', 7000);
      return;
    }
    world.refreshGroundTexture();
    composeMap();
    toast('항공사진을 입혔습니다.');
  });
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.all(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'facilities.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $<HTMLInputElement>('file-import').addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      store.replaceAll(JSON.parse(await f.text()));
      for (const v of world.views) world.rebuild(v);
      select(null);
      refreshLabels();
      composeMap();
      toast('시설 정보를 불러왔습니다.');
    } catch {
      toast('JSON 파일을 읽지 못했습니다.');
    }
  });
  $('side-toggle').addEventListener('click', () => {
    const closed = $('side').classList.toggle('closed');
    $('side-toggle').textContent = closed ? '시설 목록' : '접기';
  });
  if (innerWidth <= 820) $('side-toggle').click();

  // ---------- 터치 조이스틱 ----------
  const stick = $('stick'), knob = stick.querySelector('i')!;
  const stickMove = (e: TouchEvent) => {
    const t = e.targetTouches[0];
    const r = stick.getBoundingClientRect();
    let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    controls.stick.x = x; controls.stick.y = -y;
    knob.style.transform = `translate(${x * 35}px,${y * 35}px)`;
    e.preventDefault();
  };
  stick.addEventListener('touchstart', stickMove, { passive: false });
  stick.addEventListener('touchmove', stickMove, { passive: false });
  stick.addEventListener('touchend', () => { controls.stick.x = controls.stick.y = 0; knob.style.transform = ''; });
  for (const [id, dir] of [['btn-up', 1], ['btn-down', -1]] as const) {
    $(id).addEventListener('touchstart', (e) => { controls.stick.up = dir; e.preventDefault(); }, { passive: false });
    $(id).addEventListener('touchend', () => (controls.stick.up = 0));
  }

  // ---------- 시작 ----------
  refreshLabels();
  renderList();
  composeMap();
  await world.addOverlays(await loadJson<Overlay[]>('./data/overlays.json', []));
  $('loading').remove();

  const hud = $('hud');
  const clock = new THREE.Clock();
  let frame = 0;
  // 화면 밖에서 상태를 확인할 수 있게 노출 (자동 시험·디버깅용)
  Object.assign(window, { plant3d: { controls, world, select, goTo } });
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update(dt);
    world.updateShadow(controls.mode === 'orbit' ? controls.orbit.target : controls.pos);
    renderer.render(world.scene, camera);
    updateLabels();
    if (frame++ % 4 === 0) {
      drawMini();
      const p = camera.position;
      const gH = world.ground.heightAt(p.x, -p.z);
      const lat = data.origin.lat + -p.z / data.mPerDegLat, lon = data.origin.lon + p.x / data.mPerDegLon;
      const modeName = { orbit: '조감', drone: '드론', walk: '보행' }[controls.mode];
      hud.innerHTML = `<b>${modeName}</b> · 높이 <b>${(p.y - gH).toFixed(0)} m</b> (해발 ${p.y.toFixed(0)} m)` +
        (controls.mode !== 'orbit' ? ` · 속도 <b>${(controls.speed * 3.6).toFixed(0)} km/h</b>` : '') +
        ` · 방위 ${controls.heading().toFixed(0).padStart(3, '0')}° · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  });
}

start();
