import { useEffect, useState } from 'react';
import { MapView } from './map/MapView';
import { LEGEND_STOPS, congestionCss } from './map/colors';
import { SLOT_LABELS } from './sim/simulate';
import { shareUrl } from './state/persist';
import { useStore, type LayerToggles, type PanelTab } from './state/store';
import { LinesTab } from './ui/LinesTab';
import { ResultsPanel } from './ui/ResultsPanel';
import { SettingsTab } from './ui/SettingsTab';
import { ZonesTab } from './ui/ZonesTab';

const LAYER_LABELS: [keyof LayerToggles, string][] = [
  ['walls', '혼잡도 벽'],
  ['trains', '열차'],
  ['zones', '아파트 인구'],
  ['stations', '역 승차 인원'],
  ['labels', '역 이름'],
  ['boundaries', '행정 경계'],
];

const TABS: [PanelTab, string][] = [
  ['lines', '노선'],
  ['zones', '단지·인구'],
  ['settings', '설정'],
];

function TopBar({ onToggleLeft, onToggleRight }: { onToggleLeft: () => void; onToggleRight: () => void }) {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const setLayer = useStore((s) => s.setLayer);
  const toast = useStore((s) => s.showToast);
  const running = useStore((s) => s.sim.running);
  const ms = useStore((s) => s.sim.scenario?.ms);
  const [layersOpen, setLayersOpen] = useState(false);

  const share = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했습니다');
    } catch {
      prompt('이 링크를 복사하세요', url);
    }
  };

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onToggleLeft} aria-label="설정 패널">
        ☰
      </button>
      <div className="brand">
        <span className="logo">⛓</span>
        <div>
          <h1>김포–서울 지하철 혼잡 시뮬레이터</h1>
          <div className="sub">
            {running ? '계산 중…' : ms ? `계산 ${Math.round(ms)}ms` : ''} · 아파트 인구 기반 출근 혼잡 3D 노선도
          </div>
        </div>
      </div>
      <div className="top-actions">
        <button className={`seg ${ui.is3d ? 'on' : ''}`} onClick={() => setUi({ is3d: !ui.is3d })} title="2D/3D 전환">
          {ui.is3d ? '3D' : '2D'}
        </button>
        <div className="dropdown">
          <button onClick={() => setLayersOpen(!layersOpen)}>표시 ▾</button>
          {layersOpen && (
            <div className="dropdown-menu" onMouseLeave={() => setLayersOpen(false)}>
              {LAYER_LABELS.map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={ui.layers[k]} onChange={(e) => setLayer(k, e.target.checked)} /> {label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={share}>공유 링크</button>
        <button className="icon-btn mobile-only" onClick={onToggleRight} aria-label="결과 패널">
          📊
        </button>
      </div>
    </header>
  );
}

function Timeline() {
  const slot = useStore((s) => s.ui.slot);
  const playing = useStore((s) => s.ui.playing);
  const setUi = useStore((s) => s.setUi);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      const s = useStore.getState().ui.slot;
      useStore.getState().setUi({ slot: (s + 1) % SLOT_LABELS.length });
    }, 1800);
    return () => window.clearInterval(t);
  }, [playing]);
  return (
    <div className="timeline">
      <button className="play" onClick={() => setUi({ playing: !playing })} aria-label={playing ? '멈춤' : '재생'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="tl-main">
        <input type="range" min={0} max={SLOT_LABELS.length - 1} step={1} value={slot} onChange={(e) => setUi({ slot: Number(e.target.value), playing: false })} aria-label="출근 시간대" />
        <div className="tl-ticks">
          {SLOT_LABELS.map((l, i) => (
            <span key={l} className={i === slot ? 'on' : ''} onClick={() => setUi({ slot: i, playing: false })}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <div className="legend" aria-label="혼잡도 범례">
        <div className="legend-bar">
          {LEGEND_STOPS.map((s) => (
            <span key={s.ratio} style={{ background: congestionCss(s.ratio) }} />
          ))}
        </div>
        <div className="legend-labels">
          {LEGEND_STOPS.map((s) => (
            <span key={s.ratio}>{s.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditBanner() {
  const edit = useStore((s) => s.ui.edit);
  const lines = useStore((s) => s.scenario.customLines);
  const setUi = useStore((s) => s.setUi);
  if (edit.kind === 'none') return null;
  const line = edit.kind === 'line' ? lines.find((l) => l.id === edit.lineId) : null;
  return (
    <div className="edit-banner">
      {edit.kind === 'line' ? (
        <>
          <b>{line?.name}</b> 그리는 중 — 지도를 클릭해 역 추가 ({line?.stops.length ?? 0}개)
        </>
      ) : (
        <>단지를 놓을 위치를 클릭하세요</>
      )}
      <button onClick={() => setUi({ edit: { kind: 'none' } })}>완료</button>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.ui.toast);
  return toast ? <div className="toast" role="status">{toast}</div> : null;
}

export default function App() {
  const tab = useStore((s) => s.ui.tab);
  const setUi = useStore((s) => s.setUi);
  const [leftOpen, setLeftOpen] = useState(window.innerWidth > 900);
  const [rightOpen, setRightOpen] = useState(window.innerWidth > 900);

  return (
    <div className="app">
      <MapView padLeft={leftOpen ? 370 : 0} padRight={rightOpen ? 390 : 0} />
      <TopBar onToggleLeft={() => setLeftOpen(!leftOpen)} onToggleRight={() => setRightOpen(!rightOpen)} />
      <aside className={`panel left ${leftOpen ? 'open' : ''}`}>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setUi({ tab: id })}>
              {label}
            </button>
          ))}
          <button className="icon-btn collapse" onClick={() => setLeftOpen(false)} aria-label="패널 닫기">
            ‹
          </button>
        </nav>
        {tab === 'lines' && <LinesTab />}
        {tab === 'zones' && <ZonesTab />}
        {tab === 'settings' && <SettingsTab />}
      </aside>
      {!leftOpen && (
        <button className="reopen left" onClick={() => setLeftOpen(true)}>
          › 노선·단지
        </button>
      )}
      <aside className={`panel right ${rightOpen ? 'open' : ''}`}>
        <div className="panel-head">
          <b>출근 혼잡 결과</b>
          <span className="muted small">현재(2026) 대비</span>
          <button className="icon-btn collapse" onClick={() => setRightOpen(false)} aria-label="패널 닫기">
            ›
          </button>
        </div>
        <ResultsPanel />
      </aside>
      {!rightOpen && (
        <button className="reopen right" onClick={() => setRightOpen(true)}>
          결과 ‹
        </button>
      )}
      <Timeline />
      <EditBanner />
      <Toast />
    </div>
  );
}
