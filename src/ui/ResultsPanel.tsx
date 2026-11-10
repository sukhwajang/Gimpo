import { useMemo } from 'react';
import { scenarioChanged, useStore } from '../state/store';
import { PROBES, buildZones } from '../sim/scenario';
import type { SimResult } from '../sim/simulate';
import { CONGESTION_CLASSES, congestionClass } from '../map/colors';
import { fmt, mins, pct } from './format';
import { Icon, LevelPill, LineDot } from './kit';

function goldPeak(res: SimResult, slot: number): { ratio: number; ride: number } {
  const sl = res.slots[slot];
  let best = { ratio: 0, ride: -1 };
  res.network.rides.forEach((r, i) => {
    if (r.lineId === 'G' && sl.rideRatio[i] > best.ratio) best = { ratio: sl.rideRatio[i], ride: i };
  });
  return best;
}

/** 현재(기준) 대비 변화. goodWhen: 줄어드는 게 좋은지, 늘어나는 게 좋은지, 판단 없음 */
function Delta({ diff, unit, goodWhen = 'down', eps = 0.5, short }: { diff: number; unit: string; goodWhen?: 'down' | 'up' | 'none'; eps?: number; short?: boolean }) {
  if (!Number.isFinite(diff)) return null;
  if (Math.abs(diff) < eps) return <span className="delta flat">{short ? '변화 없음' : '현재와 같음'}</span>;
  const down = diff < 0;
  const tone = goodWhen === 'none' ? 'flat' : (goodWhen === 'down') === down ? 'good' : 'bad';
  return (
    <span className={`delta ${tone}`}>
      {down ? '▼' : '▲'} {Math.abs(Math.round(diff))}
      {unit}
      {!short && <em> 현재 대비</em>}
    </span>
  );
}

const GAUGE_MAX = 2.5;
const BOUNDS = [0, 0.8, 1.3, 1.5, 1.7, 2.0, GAUGE_MAX];
const gpos = (r: number) => `${(Math.min(Math.max(r, 0), GAUGE_MAX) / GAUGE_MAX) * 100}%`;

function Gauge({ value, base }: { value: number; base?: number }) {
  return (
    <div className="gauge" role="img" aria-label={`혼잡도 ${pct(value)}${base !== undefined ? `, 현재 ${pct(base)}` : ''}`}>
      <div className="gauge-track">
        {CONGESTION_CLASSES.map((c, i) => (
          <span key={c.label} style={{ flex: BOUNDS[i + 1] - BOUNDS[i], background: c.color }} title={`${c.label} ${c.range}`} />
        ))}
      </div>
      {base !== undefined && Math.abs(base - value) >= 0.005 && <i className="gauge-mark base" style={{ left: gpos(base) }} title={`현재 ${pct(base)}`} />}
      <i className="gauge-mark" style={{ left: gpos(value) }} />
      <div className="gauge-scale">
        {[1, 1.5, 2].map((v) => (
          <span key={v} style={{ left: gpos(v) }}>
            {v * 100}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** 시간대별 골드라인 최혼잡 구간 혼잡도 (현재 vs 시나리오) */
function SlotChart({ res, base, slot, onPick }: { res: SimResult; base: SimResult | null; slot: number; onPick: (i: number) => void }) {
  const data = res.slots.map((s, i) => ({ s: goldPeak(res, i).ratio, b: base ? goldPeak(base, i).ratio : NaN, label: s.label }));
  const top = Math.max(...data.map((d) => Math.max(d.s, Number.isFinite(d.b) ? d.b : 0)));
  const max = Math.max(2, Math.ceil((top + 0.3) * 2) / 2);
  const same = data.every((d) => !Number.isFinite(d.b) || Math.abs(d.b - d.s) < 0.005);
  const H = 104;
  return (
    <div className="slot-chart">
      <div className="chart-legend">
        {!same && (
          <span>
            <i className="sw base" /> 현재(2026)
          </span>
        )}
        <span>
          <i className="sw scen" /> {same ? '현재(2026)' : '시나리오'}
        </span>
      </div>
      <div className="bars" style={{ height: H + 20 }}>
        {[1, 2].filter((v) => v < max).map((v) => (
          <div key={v} className="grid-line" style={{ bottom: 20 + (v / max) * H }}>
            <span>{v * 100}%</span>
          </div>
        ))}
        {data.map((d, i) => (
          <button
            key={i}
            className={`bar-group ${i === slot ? 'active' : ''}`}
            onClick={() => onPick(i)}
            title={`${d.label} 출발 — ${same || !Number.isFinite(d.b) ? '' : `현재 ${pct(d.b)} → `}${pct(d.s)}`}
            aria-label={`${d.label} 출발 혼잡도 ${pct(d.s)}`}
          >
            <div className="bar-pair" style={{ height: H }}>
              {i === slot && (
                <span className="bar-value" style={{ bottom: `calc(${(Math.max(d.s, same || !Number.isFinite(d.b) ? 0 : d.b) / max) * 100}% + 3px)` }}>
                  {pct(d.s)}
                </span>
              )}
              {!same && Number.isFinite(d.b) && <div className="bar base" style={{ height: `${(d.b / max) * 100}%` }} />}
              <div className="bar scen" style={{ height: `${(d.s / max) * 100}%` }} />
            </div>
            <div className="bar-label">{d.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedCard() {
  const sel = useStore((s) => s.ui.selected);
  const res = useStore((s) => s.sim.scenario);
  const base = useStore((s) => s.sim.baseline);
  const slot = useStore((s) => s.ui.slot);
  const scenario = useStore((s) => s.scenario);
  const setUi = useStore((s) => s.setUi);
  const zones = useMemo(() => buildZones(scenario), [scenario]);
  if (!sel || !res) return null;
  const sl = res.slots[slot];
  let body: JSX.Element | null = null;
  if (sel.type === 'complex') {
    const c = res.network.complexes[sel.index];
    if (!c) return null;
    const rides = res.network.rides.map((r, i) => ({ r, i })).filter(({ r }) => r.a === c.id);
    body = (
      <>
        <h4>
          {c.name}역 {c.tentative && <span className="tag warn">가칭 · 개략 위치</span>}
        </h4>
        <p className="muted">
          {sl.label} 출발 · 승차(환승 포함) 시간당 {fmt(sl.boardings[c.id])}명
        </p>
        <table className="mini">
          <tbody>
            {rides.map(({ r, i }) => (
              <tr key={i}>
                <td>
                  <LineDot color={r.color} dashed={r.kind === 'plan'} /> {r.lineName}
                </td>
                <td className="muted">{r.bName} 방면</td>
                <td className="num">{pct(sl.rideRatio[i])}</td>
                <td>
                  <LevelPill ratio={sl.rideRatio[i]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } else if (sel.type === 'zone') {
    const z = zones[sel.index];
    if (!z) return null;
    const zi = res.zoneIds.indexOf(z.id);
    body = (
      <>
        <h4>{z.name}</h4>
        <p className="muted">
          {fmt(z.households)}세대 · 약 {fmt(z.households * scenario.settings.personsPerHousehold)}명
        </p>
        {zi >= 0 && (
          <p>
            장거리 출근 철도 이용 <b>{pct(sl.zoneRailShare[zi])}</b> · 체감 {mins(sl.zoneRailMin[zi])}
            {sl.zoneAccess[zi] >= 0 && <> · 주 이용역 {res.network.complexes[sl.zoneAccess[zi]]?.name}</>}
          </p>
        )}
      </>
    );
  } else if (sel.type === 'ride') {
    const r = res.network.rides[sel.index];
    if (!r) return null;
    const bi = base?.network.rides.findIndex((x) => x.lineId === r.lineId && x.aName === r.aName && x.bName === r.bName) ?? -1;
    const ratio = sl.rideRatio[sel.index];
    body = (
      <>
        <h4>
          <LineDot color={r.color} dashed={r.kind === 'plan'} /> {r.lineName}
        </h4>
        <p>
          {r.aName} → {r.bName} <b className="num">{pct(ratio)}</b> <LevelPill ratio={ratio} />
          {bi >= 0 && base && Math.abs(base.slots[slot].rideRatio[bi] - ratio) >= 0.005 && <span className="muted"> · 현재 {pct(base.slots[slot].rideRatio[bi])}</span>}
        </p>
        <p className="muted">
          시간당 {fmt(sl.rideLoad[sel.index])}명 / 정원 {fmt(r.capPerHour)}명 (열차 {r.tph.toFixed(1)}회 × {fmt(r.capPerTrain)}명)
        </p>
      </>
    );
  }
  return (
    <section className="card selected-card">
      <button className="icon-btn close" onClick={() => setUi({ selected: null })} aria-label="선택 해제">
        <Icon name="x" size={14} />
      </button>
      {body}
    </section>
  );
}

export function ResultsPanel() {
  const res = useStore((s) => s.sim.scenario);
  const base = useStore((s) => s.sim.baseline);
  const error = useStore((s) => s.sim.error);
  const slot = useStore((s) => s.ui.slot);
  const setUi = useStore((s) => s.setUi);
  const hidden = useStore((s) => s.ui.hiddenLines);
  const changed = useStore(scenarioChanged);

  if (error)
    return (
      <div className="results-body">
        <div className="card error">계산 오류: {error.split('\n')[0]}</div>
      </div>
    );
  if (!res)
    return (
      <div className="results-body">
        <div className="loading">
          <span className="spinner" /> 시뮬레이션 계산 중…
        </div>
      </div>
    );

  const sl = res.slots[slot];
  // 아무것도 바꾸지 않았으면 '현재 대비' 표시는 생략
  const bsl = changed ? base?.slots[slot] : undefined;
  const gp = goldPeak(res, slot);
  const gb = changed && base ? goldPeak(base, slot) : null;
  const gpRide = gp.ride >= 0 ? res.network.rides[gp.ride] : null;

  const lineMax = sl.lineMax.filter((m) => !hidden[m.lineId]).slice(0, 12);
  const maxRatio = Math.max(2.5, ...lineMax.map((m) => m.ratio));

  return (
    <div className="results-body">
      <SelectedCard />

      <section className="card hero">
        <div className="eyebrow">김포골드라인 최고 혼잡도</div>
        <div className="hero-main">
          <span className="hero-value">
            {Math.round(gp.ratio * 100)}
            <small>%</small>
          </span>
          <LevelPill ratio={gp.ratio} />
          {gb && <Delta diff={(gp.ratio - gb.ratio) * 100} unit="%p" />}
        </div>
        <Gauge value={gp.ratio} base={gb?.ratio} />
        {gpRide && (
          <button className="hero-seg" onClick={() => setUi({ selected: { type: 'ride', index: gp.ride } })}>
            <Icon name="pin" size={13} /> {gpRide.aName} → {gpRide.bName} 구간
          </button>
        )}
      </section>

      <div className="stat-grid">
        <div className="stat">
          <div className="eyebrow">철도 통근 시간</div>
          <div className="stat-value">{mins(sl.focus.avgRailMin)}</div>
          {bsl && <Delta short diff={sl.focus.avgRailMin - bsl.focus.avgRailMin} unit="분" />}
          <div className="stat-sub">김포·검단 출발, 혼잡 불편 포함 체감</div>
        </div>
        <div className="stat">
          <div className="eyebrow">철도 이용률</div>
          <div className="stat-value">{pct(sl.focus.railShare)}</div>
          {bsl && <Delta short diff={(sl.focus.railShare - bsl.focus.railShare) * 100} unit="%p" goodWhen="none" />}
          <div className="stat-sub">
            시간당 {fmt(sl.focus.railTrips)}명 / 출근 {fmt(sl.focus.commuters)}명
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">150% 이상 구간</div>
          <div className="stat-value">
            {sl.over150}
            <small>곳</small>
          </div>
          {bsl && <Delta short diff={sl.over150 - bsl.over150} unit="곳" />}
          <div className="stat-sub">전체 노선, 방향별</div>
        </div>
      </div>

      <section className="card">
        <h3>
          시간대별 골드라인 혼잡도 <span className="muted">막대를 누르면 그 시간대로 이동</span>
        </h3>
        <SlotChart res={res} base={changed ? base : null} slot={slot} onPick={(i) => setUi({ slot: i, playing: false })} />
      </section>

      <section className="card">
        <h3>
          대표 출근 경로 <span className="muted">체감 시간</span>
        </h3>
        <table className="probes">
          <thead>
            <tr>
              <th>경로</th>
              <th>현재</th>
              {changed && <th>시나리오</th>}
              {changed && <th>변화</th>}
            </tr>
          </thead>
          <tbody>
            {PROBES.map((p, i) => {
              const scen = sl.probes[i];
              if (!changed)
                return (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="num">{mins(scen)}</td>
                  </tr>
                );
              const now = bsl?.probes[i] ?? NaN;
              const d = scen - now;
              return (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="num muted">{mins(now)}</td>
                  <td className="num">{mins(scen)}</td>
                  <td className={`num ${d < -0.5 ? 'good' : d > 0.5 ? 'bad' : 'muted'}`}>{Math.abs(d) < 0.5 || !Number.isFinite(d) ? '–' : `${d < 0 ? '▼' : '▲'} ${Math.abs(Math.round(d))}분`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>
          노선별 최고 혼잡도 <span className="muted">누르면 지도에서 표시</span>
        </h3>
        <div className="line-max">
          {lineMax.map((m) => {
            const r = res.network.rides[m.ride];
            return (
              <button key={m.lineId} className="lm-row" onClick={() => setUi({ selected: { type: 'ride', index: m.ride } })}>
                <span className="lm-name">
                  <LineDot color={r.color} dashed={r.kind === 'plan'} />
                  {r.lineName}
                </span>
                <span className="lm-val">{pct(m.ratio)}</span>
                <span className="lm-bar">
                  <span style={{ width: `${(Math.min(m.ratio, maxRatio) / maxRatio) * 100}%`, background: congestionClass(m.ratio).color }} />
                  <i style={{ left: `${(1 / maxRatio) * 100}%` }} />
                </span>
                <span className="lm-seg">
                  {r.aName} → {r.bName}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="note">
        공개 자료 기반 추정치와 단순화한 모형으로 계산한 비교용 수치입니다. 골드라인 실측(2026.4 최고 183.7%)과 국토부 전망(증차 완료 시 약 170%, 5호선 연장까지 160% 이하)에 맞춰
        보정했습니다.
      </p>
    </div>
  );
}
