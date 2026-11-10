import { useEffect, useRef, useState } from 'react';
import { MapView } from './map/MapView';
import { CONGESTION_CLASSES } from './map/colors';
import { SLOT_LABELS } from './sim/simulate';
import { shareUrl } from './state/persist';
import { scenarioChanged, useStore, type LayerToggles, type PanelTab } from './state/store';
import { LinesTab } from './ui/LinesTab';
import { ResultsPanel } from './ui/ResultsPanel';
import { SettingsTab } from './ui/SettingsTab';
import { ZonesTab } from './ui/ZonesTab';
import { Icon, Logo } from './ui/kit';

const LAYER_LABELS: [keyof LayerToggles, string, string][] = [
  ['walls', '혼잡도 벽', '역 사이 구간의 혼잡도를 높이와 색으로'],
  ['trains', '열차', '배차 간격대로 움직이는 열차'],
  ['zones', '아파트 인구', '생활권별 인구 기둥'],
  ['labels', '역 이름', ''],
  ['stations', '역 승차 인원', '역별 승차(환승 포함) 기둥'],
  ['boundaries', '행정 경계', ''],
];

const TABS: [PanelTab, string][] = [
  ['lines', '노선'],
  ['zones', '단지·인구'],
  ['settings', '설정'],
];

function LayersMenu() {
  const layers = useStore((s) => s.ui.layers);
  const setLayer = useStore((s) => s.setLayer);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="popover-wrap" ref={ref}>
      <button className={`tool ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        <Icon name="layers" />
        <span>표시</span>
      </button>
      {open && (
        <div className="popover" role="menu">
          {LAYER_LABELS.map(([k, label, desc]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={layers[k]} onChange={(e) => setLayer(k, e.target.checked)} />
              <span>
                {label}
                {desc && <small>{desc}</small>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar({ leftOpen, onOpenLeft }: { leftOpen: boolean; onOpenLeft: () => void }) {
  const is3d = useStore((s) => s.ui.is3d);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.showToast);
  const running = useStore((s) => s.sim.running);

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
    <div className="toolbar">
      {!leftOpen && (
        <button className="tool" onClick={onOpenLeft} aria-label="노선·단지 패널 열기">
          <Icon name="menu" />
          <span>노선·단지</span>
        </button>
      )}
      <div className="seg" role="group" aria-label="지도 보기">
        <button className={is3d ? 'on' : ''} onClick={() => setUi({ is3d: true })} aria-pressed={is3d}>
          3D
        </button>
        <button className={!is3d ? 'on' : ''} onClick={() => setUi({ is3d: false })} aria-pressed={!is3d}>
          2D
        </button>
      </div>
      <LayersMenu />
      <button className="tool" onClick={share} title="지금 시나리오를 링크로 복사">
        <Icon name="link" />
        <span>공유</span>
      </button>
      {running && (
        <span className="status-chip" role="status">
          <span className="spinner" /> 계산 중
        </span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="범례">
      <div className="legend-title">
        혼잡도 <small>벽 높이·색 = 더 붐비는 방향 기준</small>
      </div>
      <ul className="legend-scale">
        {CONGESTION_CLASSES.map((c) => (
          <li key={c.label}>
            <i style={{ background: c.color }} />
            <b>{c.label}</b>
            <small>{c.range}</small>
          </li>
        ))}
      </ul>
      <ul className="legend-keys">
        <li>
          <i className="key-solid" /> 운영 노선
        </li>
        <li>
          <i className="key-dash" /> 계획 노선
        </li>
        <li>
          <i className="key-ring" /> 가칭 역
        </li>
        <li>
          <i className="key-col" /> 아파트 인구
        </li>
        <li>
          <i className="key-col dev" /> 개발 예정
        </li>
      </ul>
    </div>
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
  const last = SLOT_LABELS.length - 1;
  return (
    <div className="timeline">
      <button className="play" onClick={() => setUi({ playing: !playing })} aria-label={playing ? '멈춤' : '출근 시간대 재생'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className="tl-now">
        <b>{SLOT_LABELS[slot]}</b>
        <small>집 출발</small>
      </div>
      <div className="tl-main">
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={slot}
          style={{ '--p': `${(slot / last) * 100}%` } as React.CSSProperties}
          onChange={(e) => setUi({ slot: Number(e.target.value), playing: false })}
          aria-label="출근 시간대"
          aria-valuetext={`${SLOT_LABELS[slot]} 출발`}
        />
        <div className="tl-ticks" aria-hidden="true">
          {SLOT_LABELS.map((l, i) => (
            <button key={l} tabIndex={-1} className={i === slot ? 'on' : ''} onClick={() => setUi({ slot: i, playing: false })}>
              {l}
            </button>
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
    <div className="edit-banner" role="status">
      <Icon name="pin" />
      {edit.kind === 'line' ? (
        <span>
          <b>{line?.name}</b> 그리는 중 · 지도를 클릭해 역 추가 ({line?.stops.length ?? 0}개)
        </span>
      ) : (
        <span>단지를 놓을 위치를 클릭하세요</span>
      )}
      <button onClick={() => setUi({ edit: { kind: 'none' } })}>완료</button>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.ui.toast);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}

export default function App() {
  const tab = useStore((s) => s.ui.tab);
  const slot = useStore((s) => s.ui.slot);
  const setUi = useStore((s) => s.setUi);
  const editing = useStore((s) => s.ui.edit.kind !== 'none');
  const changed = useStore(scenarioChanged);
  const wide = () => window.innerWidth > 900;
  const [leftOpen, setLeftOpen] = useState(wide);
  const [rightOpen, setRightOpen] = useState(wide);

  // 모바일에서 지도에 그리기 시작하면 패널을 접어 지도를 보여준다
  useEffect(() => {
    if (editing && !wide()) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [editing]);

  return (
    <div className={`app ${leftOpen ? 'left-open' : ''} ${rightOpen ? 'right-open' : ''}`}>
      <aside className="sidebar" aria-label="노선·단지 설정" hidden={!leftOpen}>
        <header className="brand">
          <Logo />
          <div className="brand-text">
            <h1>김포–서울 지하철 혼잡 시뮬레이터</h1>
            <p>아파트 인구로 보는 출근길 혼잡</p>
          </div>
          <button className="icon-btn" onClick={() => setLeftOpen(false)} aria-label="패널 접기" title="패널 접기">
            <Icon name="chevronLeft" size={18} />
          </button>
        </header>
        <nav className="seg tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setUi({ tab: id })}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-body">
          {tab === 'lines' && <LinesTab />}
          {tab === 'zones' && <ZonesTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </aside>

      <main className="stage">
        <MapView padRight={rightOpen ? 392 : 0} />
        <Toolbar leftOpen={leftOpen} onOpenLeft={() => setLeftOpen(true)} />

        {!rightOpen && (
          <button className="tool results-open" onClick={() => setRightOpen(true)} aria-label="결과 패널 열기">
            <Icon name="chart" />
            <span>결과</span>
          </button>
        )}
        <aside className="results" aria-label="출근 혼잡 결과" hidden={!rightOpen}>
          <header className="results-head">
            <div>
              <h2>출근 혼잡 결과</h2>
              <p>
                <b>{SLOT_LABELS[slot]}</b> 집 출발 · {changed ? '현재(2026)와 비교' : '현재(2026) 상태'}
              </p>
            </div>
            <button className="icon-btn" onClick={() => setRightOpen(false)} aria-label="결과 패널 접기" title="접기">
              <Icon name="chevronRight" size={18} />
            </button>
          </header>
          <ResultsPanel />
        </aside>

        <div className="dock">
          <Legend />
          <Timeline />
        </div>
        <EditBanner />
        <Toast />
      </main>

      {(leftOpen || rightOpen) && (
        <button
          className="backdrop"
          aria-label="패널 닫기"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}
    </div>
  );
}
