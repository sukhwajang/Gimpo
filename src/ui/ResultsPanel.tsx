import { useMemo } from 'react';
import { useStore } from '../state/store';
import { PROBES, buildZones } from '../sim/scenario';
import type { SimResult } from '../sim/simulate';
import { congestionCss, congestionLabel } from '../map/colors';
import { fmt, mins, pct, signed } from './format';

function goldPeak(res: SimResult, slot: number): { ratio: number; ride: number } {
  const sl = res.slots[slot];
  let best = { ratio: 0, ride: -1 };
  res.network.rides.forEach((r, i) => {
    if (r.lineId === 'G' && sl.rideRatio[i] > best.ratio) best = { ratio: sl.rideRatio[i], ride: i };
  });
  return best;
}

function Kpi({ title, value, sub, delta, good }: { title: string; value: string; sub?: string; delta?: string; good?: boolean | null }) {
  return (
    <div className="kpi">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {delta !== undefined && (
        <div className={`kpi-delta ${good === null || good === undefined ? '' : good ? 'good' : 'bad'}`}>
          {good === true ? '▼ ' : good === false ? '▲ ' : ''}
          현재 대비 {delta}
        </div>
      )}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** 시간대별 골드라인 최혼잡 구간 혼잡도 (현재 vs 시나리오) */
function SlotChart({ res, base, slot, onPick }: { res: SimResult; base: SimResult | null; slot: number; onPick: (i: number) => void }) {
  const data = res.slots.map((_, i) => ({ s: goldPeak(res, i).ratio, b: base ? goldPeak(base, i).ratio : NaN, label: res.slots[i].label }));
  const max = Math.max(2.5, ...data.map((d) => Math.max(d.s, d.b || 0)));
  const H = 92;
  return (
    <div className="slot-chart">
      <div className="chart-head">
        <span>골드라인 최혼잡 구간 · 시간대별</span>
        <span className="legend-inline">
          <i className="sw base" /> 현재 <i className="sw scen" /> 시나리오
        </span>
      </div>
      <div className="bars" style={{ height: H + 18 }}>
        <div className="ref-line" style={{ bottom: 18 + (1 / max) * H }} title="정원 100%">
          <span>100%</span>
        </div>
        {data.map((d, i) => (
          <button
            key={i}
            className={`bar-group ${i === slot ? 'active' : ''}`}
            onClick={() => onPick(i)}
            title={`${d.label} 출발 — 현재 ${Number.isFinite(d.b) ? pct(d.b) : '–'} / 시나리오 ${pct(d.s)}`}
          >
            <div className="bar-pair" style={{ height: H }}>
              {Number.isFinite(d.b) && <div className="bar base" style={{ height: `${(d.b / max) * 100}%` }} />}
              <div className="bar scen" style={{ height: `${(d.s / max) * 100}%` }} />
            </div>
            <div className="bar-label">{d.label.replace(':00', '시').replace(':30', ':30')}</div>
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
          {c.name}역 {c.tentative && <span className="tag warn">가칭·개략 위치</span>}
        </h4>
        <div className="muted">승차(환승 포함) 시간당 {fmt(sl.boardings[c.id])}명 · {sl.label} 출발</div>
        <table className="mini">
          <tbody>
            {rides.map(({ r, i }) => (
              <tr key={i}>
                <td>
                  <i className="dot" style={{ background: r.color }} /> {r.lineName}
                </td>
                <td>→ {r.bName}</td>
                <td style={{ color: congestionCss(sl.rideRatio[i]) }}>{pct(sl.rideRatio[i])}</td>
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
        <div className="muted">
          {fmt(z.households)}세대 · 약 {fmt(z.households * scenario.settings.personsPerHousehold)}명
        </div>
        {zi >= 0 && (
          <div>
            장거리 출근 철도 이용 <b>{pct(sl.zoneRailShare[zi])}</b> · 체감 {mins(sl.zoneRailMin[zi])}
            {sl.zoneAccess[zi] >= 0 && <> · 주 이용역 {res.network.complexes[sl.zoneAccess[zi]]?.name}</>}
          </div>
        )}
      </>
    );
  } else if (sel.type === 'ride') {
    const r = res.network.rides[sel.index];
    if (!r) return null;
    const bi = base?.network.rides.findIndex((x) => x.lineId === r.lineId && x.aName === r.aName && x.bName === r.bName) ?? -1;
    body = (
      <>
        <h4>
          <i className="dot" style={{ background: r.color }} /> {r.lineName} {r.aName} → {r.bName}
        </h4>
        <div>
          혼잡도 <b style={{ color: congestionCss(sl.rideRatio[sel.index]) }}>{pct(sl.rideRatio[sel.index])}</b> ({congestionLabel(sl.rideRatio[sel.index])})
          {bi >= 0 && base && <span className="muted"> · 현재 {pct(base.slots[slot].rideRatio[bi])}</span>}
        </div>
        <div className="muted">
          시간당 {fmt(sl.rideLoad[sel.index])}명 / 정원 {fmt(r.capPerHour)}명 · 열차 {r.tph.toFixed(1)}회 × {fmt(r.capPerTrain)}명
        </div>
      </>
    );
  }
  return (
    <div className="card selected-card">
      <button className="close" onClick={() => setUi({ selected: null })} aria-label="닫기">
        ×
      </button>
      {body}
    </div>
  );
}

export function ResultsPanel() {
  const res = useStore((s) => s.sim.scenario);
  const base = useStore((s) => s.sim.baseline);
  const running = useStore((s) => s.sim.running);
  const error = useStore((s) => s.sim.error);
  const slot = useStore((s) => s.ui.slot);
  const setUi = useStore((s) => s.setUi);
  const hidden = useStore((s) => s.ui.hiddenLines);

  if (error) return <div className="panel-body"><div className="card error">계산 오류: {error.split('\n')[0]}</div></div>;
  if (!res) return <div className="panel-body"><div className="loading">시뮬레이션 계산 중…</div></div>;

  const sl = res.slots[slot];
  const bsl = base?.slots[slot];
  const gp = goldPeak(res, slot);
  const gb = base ? goldPeak(base, slot) : null;
  const gpRide = gp.ride >= 0 ? res.network.rides[gp.ride] : null;

  const lineMax = sl.lineMax.filter((m) => !hidden[m.lineId]).slice(0, 12);
  const maxRatio = Math.max(2.5, ...lineMax.map((m) => m.ratio));

  return (
    <div className="panel-body">
      <SelectedCard />
      <div className="results-head">
        <div>
          <b>{sl.label}</b> 출발 기준 <span className="muted">(30분 수요를 시간당으로 환산)</span>
        </div>
        {running && <span className="spinner" aria-label="계산 중" />}
      </div>

      <div className="kpis">
        <Kpi
          title="골드라인 최고 혼잡도"
          value={pct(gp.ratio)}
          sub={gpRide ? `${gpRide.aName}→${gpRide.bName} · ${congestionLabel(gp.ratio)}` : undefined}
          delta={gb ? signed((gp.ratio - gb.ratio) * 100, '%p') : undefined}
          good={gb ? (Math.abs(gp.ratio - gb.ratio) < 0.005 ? null : gp.ratio < gb.ratio) : null}
        />
        <Kpi
          title="김포·검단 철도 통근 (체감)"
          value={mins(sl.focus.avgRailMin)}
          sub="혼잡 불편을 시간으로 환산해 포함"
          delta={bsl ? signed(sl.focus.avgRailMin - bsl.focus.avgRailMin, '분') : undefined}
          good={bsl ? (Math.abs(sl.focus.avgRailMin - bsl.focus.avgRailMin) < 0.5 ? null : sl.focus.avgRailMin < bsl.focus.avgRailMin) : null}
        />
        <Kpi
          title="김포·검단 장거리 출근 철도 이용률"
          value={pct(sl.focus.railShare)}
          sub={`시간당 철도 ${fmt(sl.focus.railTrips)}명 / 출근 ${fmt(sl.focus.commuters)}명`}
          delta={bsl ? signed((sl.focus.railShare - bsl.focus.railShare) * 100, '%p') : undefined}
          good={null}
        />
        <Kpi
          title="혼잡도 150% 이상 구간"
          value={`${sl.over150}개`}
          sub="방향별 역간 구간 수"
          delta={bsl ? signed(sl.over150 - bsl.over150, '개') : undefined}
          good={bsl ? (sl.over150 === bsl.over150 ? null : sl.over150 < bsl.over150) : null}
        />
      </div>

      <SlotChart res={res} base={base} slot={slot} onPick={(i) => setUi({ slot: i })} />

      <div className="section-title">대표 출근 경로 (체감 시간)</div>
      <table className="probes">
        <thead>
          <tr>
            <th>경로</th>
            <th>현재</th>
            <th>시나리오</th>
            <th>변화</th>
          </tr>
        </thead>
        <tbody>
          {PROBES.map((p, i) => {
            const now = bsl?.probes[i] ?? NaN;
            const scen = sl.probes[i];
            const d = scen - now;
            return (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td>{mins(now)}</td>
                <td>{mins(scen)}</td>
                <td className={d < -0.5 ? 'good' : d > 0.5 ? 'bad' : 'muted'}>{signed(d, '분')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="section-title">노선별 최고 혼잡도</div>
      <div className="line-max">
        {lineMax.map((m) => {
          const r = res.network.rides[m.ride];
          return (
            <button key={m.lineId} className="lm-row" onClick={() => setUi({ selected: { type: 'ride', index: m.ride } })} title={`${r.aName}→${r.bName}`}>
              <span className="lm-name">
                <i className="dot" style={{ background: r.color }} />
                {r.lineName}
              </span>
              <span className="lm-bar">
                <span style={{ width: `${(m.ratio / maxRatio) * 100}%`, background: congestionCss(m.ratio) }} />
                <span className="lm-100" style={{ left: `${(1 / maxRatio) * 100}%` }} />
              </span>
              <span className="lm-val">{pct(m.ratio)}</span>
              <span className="lm-seg">
                {r.aName}→{r.bName}
              </span>
            </button>
          );
        })}
      </div>
      <p className="note">
        수치는 공개 자료 기반 추정치와 단순화한 모형으로 계산한 상대 비교용 값입니다. 골드라인 실측(2026.4 최고 183.7%)과 국토부 전망(증차 완료 시 약
        170%, 5호선 연장까지 160% 이하)에 맞춰 보정했습니다.
      </p>
    </div>
  );
}
