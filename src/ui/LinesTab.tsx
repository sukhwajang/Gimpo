import { useState, type CSSProperties } from 'react';
import { PLANS, LEVEL_LABEL } from '../data/plans';
import { EXISTING_LINES, planStops } from '../sim/resolve';
import { useStore } from '../state/store';
import type { CustomLine, LineParams, PlanDef } from '../types';
import { fmt } from './format';
import { Icon, LineDot, Switch } from './kit';

const PRESETS: { label: string; params: LineParams }[] = [
  { label: '경전철 2량', params: { tph: 24, cap: 172, speed: 45 } },
  { label: '중전철 6량', params: { tph: 15, cap: 960, speed: 40 } },
  { label: '중전철 8량', params: { tph: 15, cap: 1280, speed: 40 } },
  { label: '광역급행', params: { tph: 6, cap: 1000, speed: 85 } },
];

const CUSTOM_COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#e879f9', '#38bdf8', '#facc15'];

function NumberField({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <span className="num-input">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function ParamsEditor({ params, onChange }: { params: LineParams; onChange: (p: Partial<LineParams>) => void }) {
  return (
    <div className="params">
      <div className="params-grid">
        <NumberField label="시간당 열차" value={+params.tph.toFixed(1)} min={1} max={40} step={1} unit="회" onChange={(v) => onChange({ tph: v })} />
        <NumberField label="열차 정원" value={params.cap} min={50} max={3000} step={10} unit="명" onChange={(v) => onChange({ cap: v })} />
        <NumberField label="표정속도" value={params.speed} min={15} max={150} step={1} unit="km/h" onChange={(v) => onChange({ speed: v })} />
      </div>
      <p className="hint">
        시간당 수송력 {fmt(params.tph * params.cap)}명 · 배차 {(60 / params.tph).toFixed(1)}분
      </p>
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
  const stops = planStops(plan, options);
  return (
    <article className={`plan ${active ? 'on' : ''} ${open ? 'open' : ''}`} style={{ '--c': plan.color } as CSSProperties}>
      <div className="plan-head">
        <button className="plan-main" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="plan-name">{plan.name}</span>
          <span className="plan-meta">
            <span className={`badge lv-${plan.level}`}>{LEVEL_LABEL[plan.level]}</span>
            {plan.openYear && <span className="plan-year">{plan.openYear}</span>}
          </span>
        </button>
        <button className="icon-btn chev" onClick={() => setOpen(!open)} aria-label={open ? '접기' : '자세히'}>
          <Icon name="chevronDown" />
        </button>
        <Switch checked={active} onChange={() => togglePlan(plan.id)} label={`${plan.shortName} ${active ? '끄기' : '켜기'}`} />
      </div>
      {open && (
        <div className="plan-body">
          <p className="plan-status">{plan.status}</p>
          <p>{plan.description}</p>
          {plan.requires && (
            <p className="hint">
              함께 켜지는 계획: {plan.requires.map((r) => PLANS.find((p) => p.id === r)?.shortName ?? r).join(', ')}
            </p>
          )}
          {plan.options && (
            <div className="opts">
              {plan.options.map((o) => (
                <label key={o.id} className="check">
                  <input type="checkbox" checked={!!options[o.id]} onChange={() => toggleOpt(o.id)} />
                  <span>
                    {o.label}
                    {o.description && <small>{o.description}</small>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {stops.length > 0 && (
            <ol className="route" aria-label="정거장">
              {stops.map((s, i) => (
                <li key={i} className={s.tentative ? 'tent' : ''}>
                  {s.name.replace(/\(.*?\)/g, '')}
                </li>
              ))}
            </ol>
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
          <div className="sources">
            {plan.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.title} <Icon name="external" size={11} />
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function ExistingLines() {
  const hidden = useStore((s) => s.ui.hiddenLines);
  const overrides = useStore((s) => s.scenario.lineOverrides);
  const toggleHidden = useStore((s) => s.toggleHiddenLine);
  const setOverride = useStore((s) => s.setLineOverride);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="list">
      {EXISTING_LINES.map((l) => {
        const o = overrides[l.id];
        const params = { ...l.params, ...o };
        return (
          <div key={l.id} className={`list-item ${hidden[l.id] ? 'dim' : ''}`}>
            <div className="list-row">
              <button className="list-main" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
                <LineDot color={l.color} />
                <span className="list-name">
                  {l.name} {o && <span className="tag">조정됨</span>}
                </span>
                <span className="list-meta">
                  {params.tph}회 × {fmt(params.cap)}명
                </span>
              </button>
              <button className="icon-btn" onClick={() => toggleHidden(l.id)} aria-label={hidden[l.id] ? `${l.name} 지도에 보이기` : `${l.name} 지도에서 숨기기`} title={hidden[l.id] ? '지도에 보이기' : '지도에서 숨기기'}>
                <Icon name={hidden[l.id] ? 'eyeOff' : 'eye'} />
              </button>
            </div>
            {open === l.id && (
              <div className="list-detail">
                {l.note && <p className="hint">{l.note}</p>}
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
      <p className="callout">
        <b>지도를 클릭해 역을 순서대로 추가하세요.</b> 기존 역이나 계획역 근처(약 380m)를 누르면 그 역에 붙어 환승역이 됩니다.
      </p>
      <div className="row">
        <input className="text grow" value={line.name} onChange={(e) => update(line.id, { name: e.target.value })} aria-label="노선 이름" />
        <input type="color" value={line.color} onChange={(e) => update(line.id, { color: e.target.value })} aria-label="노선 색" />
      </div>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => update(line.id, { params: p.params })}>
            {p.label}
          </button>
        ))}
      </div>
      <ParamsEditor params={line.params} onChange={(p) => update(line.id, { params: { ...line.params, ...p } })} />
      {line.stops.length > 0 && (
        <ol className="stop-list">
          {line.stops.map((s, i) => (
            <li key={i}>
              <span className="stop-no">{i + 1}</span>
              <input className="text grow" value={s.name} onChange={(e) => updateStop(line.id, i, { name: e.target.value, ref: undefined })} disabled={!!s.ref} title={s.ref ? '기존 역에 연결된 환승역' : ''} aria-label={`${i + 1}번째 역 이름`} />
              {s.ref && <span className="tag">환승</span>}
              <button className="icon-btn" onClick={() => moveStop(line.id, i, -1)} aria-label="위로" disabled={i === 0}>
                <Icon name="arrowUp" size={14} />
              </button>
              <button className="icon-btn" onClick={() => moveStop(line.id, i, 1)} aria-label="아래로" disabled={i === line.stops.length - 1}>
                <Icon name="arrowDown" size={14} />
              </button>
              <button className="icon-btn danger" onClick={() => removeStop(line.id, i)} aria-label="역 삭제">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {line.stops.length < 2 && <p className="hint">역이 2개 이상이면 시뮬레이션에 반영됩니다.</p>}
      <button className="btn primary block" onClick={() => setUi({ edit: { kind: 'none' } })}>
        <Icon name="check" /> 그리기 완료
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
    <>
      {lines.map((l) => {
        const editing = edit.kind === 'line' && edit.lineId === l.id;
        return (
          <article key={l.id} className={`plan custom ${l.visible ? 'on' : ''} ${editing ? 'editing open' : ''}`} style={{ '--c': l.color } as CSSProperties}>
            <div className="plan-head">
              <div className="plan-main static">
                <span className="plan-name">{l.name}</span>
                <span className="plan-meta">
                  <span className="plan-year">
                    {l.stops.length}개 역 · {l.params.tph}회 × {fmt(l.params.cap)}명
                  </span>
                </span>
              </div>
              {!editing && (
                <button className="icon-btn" onClick={() => setUi({ edit: { kind: 'line', lineId: l.id } })} aria-label={`${l.name} 편집`} title="편집">
                  <Icon name="pencil" />
                </button>
              )}
              <button
                className="icon-btn danger"
                onClick={() => {
                  if (confirm(`'${l.name}' 노선을 삭제할까요?`)) remove(l.id);
                }}
                aria-label={`${l.name} 삭제`}
                title="삭제"
              >
                <Icon name="trash" />
              </button>
              <Switch checked={l.visible} onChange={() => update(l.id, { visible: !l.visible })} label={`${l.name} 시뮬레이션 포함`} />
            </div>
            {editing && (
              <div className="plan-body">
                <LineEditor line={l} />
              </div>
            )}
          </article>
        );
      })}
      {edit.kind !== 'line' && (
        <button className="btn dashed block" onClick={newLine}>
          <Icon name="plus" /> 새 노선 그리기
        </button>
      )}
    </>
  );
}

export function LinesTab() {
  const activeCount = useStore((s) => PLANS.filter((p) => s.scenario.activePlans[p.id]).length);
  return (
    <div className="tab-body">
      <section>
        <header className="sec-head">
          <h2>철도 계획</h2>
          <span className="count">
            {activeCount} / {PLANS.length} 켜짐
          </span>
        </header>
        <p className="sec-desc">켜면 지도에 점선으로 나타나고 혼잡도를 바로 다시 계산합니다.</p>
        {PLANS.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </section>
      <section>
        <header className="sec-head">
          <h2>내가 그린 노선</h2>
        </header>
        <p className="sec-desc">아직 계획에 없는 노선을 지도에 직접 그려 효과를 볼 수 있습니다.</p>
        <CustomLines />
      </section>
      <section>
        <header className="sec-head">
          <h2>운영 중인 노선</h2>
          <span className="count">{EXISTING_LINES.length}개</span>
        </header>
        <p className="sec-desc">이름을 누르면 열차 횟수·정원·속도를 바꿀 수 있습니다. 눈 아이콘은 지도 표시만 끕니다.</p>
        <ExistingLines />
      </section>
    </div>
  );
}
