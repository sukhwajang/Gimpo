import { useState } from 'react';
import { PLANS, LEVEL_LABEL } from '../data/plans';
import { EXISTING_LINES } from '../sim/resolve';
import { useStore } from '../state/store';
import type { CustomLine, LineParams, PlanDef } from '../types';
import { fmt } from './format';

const PRESETS: { label: string; params: LineParams }[] = [
  { label: '경전철 2량 (골드라인급)', params: { tph: 24, cap: 172, speed: 45 } },
  { label: '중량전철 6량', params: { tph: 15, cap: 960, speed: 40 } },
  { label: '중량전철 8량', params: { tph: 15, cap: 1280, speed: 40 } },
  { label: '광역급행 (GTX급)', params: { tph: 6, cap: 1000, speed: 80 } },
];

const CUSTOM_COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#e879f9', '#38bdf8', '#facc15'];

function NumberField({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string }) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
      {unit && <em>{unit}</em>}
    </label>
  );
}

function ParamsEditor({ params, onChange }: { params: LineParams; onChange: (p: Partial<LineParams>) => void }) {
  return (
    <div className="params">
      <NumberField label="시간당 열차" value={+params.tph.toFixed(1)} min={1} max={40} step={1} unit="회" onChange={(v) => onChange({ tph: v })} />
      <NumberField label="열차 정원" value={params.cap} min={50} max={3000} step={10} unit="명" onChange={(v) => onChange({ cap: v })} />
      <NumberField label="표정속도" value={params.speed} min={15} max={150} step={1} unit="km/h" onChange={(v) => onChange({ speed: v })} />
      <div className="muted small">시간당 수송력 {fmt(params.tph * params.cap)}명 · 배차 {(60 / params.tph).toFixed(1)}분</div>
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanDef }) {
  const active = useStore((s) => !!s.scenario.activePlans[plan.id]);
  const options = useStore((s) => s.scenario.planOptions);
  const override = useStore((s) => s.scenario.lineOverrides[plan.id]);
  const togglePlan = useStore((s) => s.togglePlan);
  const toggleOpt = useStore((s) => s.togglePlanOption);
  const setOverride = useStore((s) => s.setLineOverride);
  const [open, setOpen] = useState(false);
  const params = { ...plan.params, ...override };
  return (
    <div className={`plan-card ${active ? 'active' : ''}`}>
      <div className="plan-top">
        <label className="switch" title={active ? '끄기' : '켜기'}>
          <input type="checkbox" checked={active} onChange={() => togglePlan(plan.id)} />
          <span />
        </label>
        <i className="swatch" style={{ background: plan.color }} />
        <div className="plan-title" onClick={() => setOpen(!open)}>
          <div>
            {plan.name} <span className={`badge lv-${plan.level}`}>{LEVEL_LABEL[plan.level]}</span>
          </div>
          <div className="muted small">
            {plan.status}
            {plan.openYear ? ` · 개통 ${plan.openYear}` : ''}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="자세히">
          {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="plan-detail">
          <p>{plan.description}</p>
          {plan.options && (
            <div className="opts">
              {plan.options.map((o) => (
                <label key={o.id} className="check" title={o.description}>
                  <input type="checkbox" checked={!!options[o.id]} onChange={() => toggleOpt(o.id)} /> {o.label}
                  {o.description && <span className="muted small"> — {o.description}</span>}
                </label>
              ))}
            </div>
          )}
          {!plan.ops && (
            <>
              <ParamsEditor params={params} onChange={(p) => setOverride(plan.id, p)} />
              {override && (
                <button className="link" onClick={() => setOverride(plan.id, null)}>
                  운행 설정 기본값으로
                </button>
              )}
            </>
          )}
          {plan.stops.length > 0 && (
            <div className="stops-preview small">
              {plan.stops
                .filter((s) => !s.option || options[s.option])
                .map((s) => s.name)
                .join(' – ')}
            </div>
          )}
          <div className="sources">
            {plan.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExistingLines() {
  const hidden = useStore((s) => s.ui.hiddenLines);
  const overrides = useStore((s) => s.scenario.lineOverrides);
  const toggleHidden = useStore((s) => s.toggleHiddenLine);
  const setOverride = useStore((s) => s.setLineOverride);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="existing-list">
      {EXISTING_LINES.map((l) => {
        const o = overrides[l.id];
        const params = { ...l.params, ...o };
        return (
          <div key={l.id} className="ex-row-wrap">
            <div className="ex-row">
              <button className={`eye ${hidden[l.id] ? 'off' : ''}`} onClick={() => toggleHidden(l.id)} title={hidden[l.id] ? '보이기' : '숨기기'}>
                {hidden[l.id] ? '◌' : '●'}
              </button>
              <i className="swatch" style={{ background: l.color }} />
              <span className="ex-name" onClick={() => setOpen(open === l.id ? null : l.id)}>
                {l.name} {o && <span className="tag">조정됨</span>}
              </span>
              <span className="muted small">
                {params.tph}회 × {fmt(params.cap)}명
              </span>
            </div>
            {open === l.id && (
              <div className="ex-detail">
                {l.note && <div className="muted small">{l.note}</div>}
                <ParamsEditor params={params} onChange={(p) => setOverride(l.id, p)} />
                {o && (
                  <button className="link" onClick={() => setOverride(l.id, null)}>
                    기본값으로
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="note">숨기기는 지도 표시만 끕니다. 운행 설정(열차 횟수·정원·속도)을 바꾸면 혼잡도가 다시 계산됩니다.</p>
    </div>
  );
}

function LineEditor({ line }: { line: CustomLine }) {
  const update = useStore((s) => s.updateCustomLine);
  const updateStop = useStore((s) => s.updateStop);
  const removeStop = useStore((s) => s.removeStop);
  const moveStop = useStore((s) => s.moveStop);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="editor">
      <div className="editor-hint">
        <b>지도를 클릭해 역을 순서대로 추가하세요.</b> 기존 역이나 계획역 근처(약 380m)를 누르면 그 역에 붙어 환승역이 됩니다.
      </div>
      <div className="row">
        <input className="text" value={line.name} onChange={(e) => update(line.id, { name: e.target.value })} aria-label="노선 이름" />
        <input type="color" value={line.color} onChange={(e) => update(line.id, { color: e.target.value })} aria-label="노선 색" />
      </div>
      <div className="row wrap">
        {PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => update(line.id, { params: p.params })}>
            {p.label}
          </button>
        ))}
      </div>
      <ParamsEditor params={line.params} onChange={(p) => update(line.id, { params: { ...line.params, ...p } })} />
      <ol className="stop-list">
        {line.stops.map((s, i) => (
          <li key={i}>
            <input className="text" value={s.name} onChange={(e) => updateStop(line.id, i, { name: e.target.value, ref: undefined })} disabled={!!s.ref} title={s.ref ? '기존 역에 연결된 환승역' : ''} />
            {s.ref && <span className="tag">환승</span>}
            <button className="icon-btn" onClick={() => moveStop(line.id, i, -1)} aria-label="위로">
              ↑
            </button>
            <button className="icon-btn" onClick={() => moveStop(line.id, i, 1)} aria-label="아래로">
              ↓
            </button>
            <button className="icon-btn danger" onClick={() => removeStop(line.id, i)} aria-label="삭제">
              ×
            </button>
          </li>
        ))}
      </ol>
      {line.stops.length < 2 && <div className="muted small">역이 2개 이상이면 시뮬레이션에 반영됩니다.</div>}
      <button className="primary" onClick={() => setUi({ edit: { kind: 'none' } })}>
        그리기 완료
      </button>
    </div>
  );
}

function CustomLines() {
  const lines = useStore((s) => s.scenario.customLines);
  const edit = useStore((s) => s.ui.edit);
  const add = useStore((s) => s.addCustomLine);
  const update = useStore((s) => s.updateCustomLine);
  const remove = useStore((s) => s.removeCustomLine);
  const setUi = useStore((s) => s.setUi);
  const newLine = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const color = CUSTOM_COLORS[lines.length % CUSTOM_COLORS.length];
    add({ id, name: `내 노선 ${lines.length + 1}`, color, params: PRESETS[1].params, stops: [], visible: true });
    setUi({ edit: { kind: 'line', lineId: id }, selected: null });
  };
  return (
    <div>
      {lines.map((l) => {
        const editing = edit.kind === 'line' && edit.lineId === l.id;
        return (
          <div key={l.id} className={`custom-card ${editing ? 'editing' : ''}`}>
            <div className="ex-row">
              <label className="switch small" title="시뮬레이션 포함">
                <input type="checkbox" checked={l.visible} onChange={() => update(l.id, { visible: !l.visible })} />
                <span />
              </label>
              <i className="swatch" style={{ background: l.color }} />
              <span className="ex-name">{l.name}</span>
              <span className="muted small">{l.stops.length}개 역</span>
              {!editing && (
                <button className="icon-btn" onClick={() => setUi({ edit: { kind: 'line', lineId: l.id } })} title="편집">
                  ✎
                </button>
              )}
              <button
                className="icon-btn danger"
                onClick={() => {
                  if (confirm(`'${l.name}' 노선을 삭제할까요?`)) remove(l.id);
                }}
                title="삭제"
              >
                🗑
              </button>
            </div>
            {editing && <LineEditor line={l} />}
          </div>
        );
      })}
      {edit.kind !== 'line' && (
        <button className="primary block" onClick={newLine}>
          + 새 노선 그리기
        </button>
      )}
    </div>
  );
}

export function LinesTab() {
  return (
    <div className="panel-body">
      <div className="section-title">김포–서울 철도 계획</div>
      {PLANS.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
      <div className="section-title">내가 그린 노선 (아직 계획 없는 노선)</div>
      <CustomLines />
      <div className="section-title">기존 노선 · 운행 조정</div>
      <ExistingLines />
    </div>
  );
}
