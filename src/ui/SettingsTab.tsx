import { useRef, useState } from 'react';
import { checkVworldKey, type VworldCheckResult } from '../map/vworldCheck';
import { BASEMAPS } from '../map/basemaps';
import { exportJson, importJson } from '../state/persist';
import { useStore, type BasemapId } from '../state/store';
import { DEFAULT_SETTINGS, type SimSettings } from '../types';

const FIELDS: { key: keyof SimSettings; label: string; min: number; max: number; step: number; help: string }[] = [
  { key: 'personsPerHousehold', label: '가구당 인원', min: 1.5, max: 3.5, step: 0.05, help: '세대수 → 인구 환산' },
  { key: 'commuteRate', label: '출근 인구 비율', min: 0.1, max: 0.5, step: 0.01, help: '인구 중 아침(06~10시)에 출근·통학하는 비율' },
  { key: 'otherDemandFactor', label: '기타 수요 배율', min: 0.5, max: 2, step: 0.05, help: '통학·업무 등 추가 통행' },
  { key: 'railBias', label: '철도 선호 (분)', min: -20, max: 20, step: 1, help: '+면 철도를 더 선호 (버스·승용차 대비)' },
  { key: 'roadSpeed', label: '도로 평균 속도 (km/h)', min: 10, max: 40, step: 1, help: '출근길 버스·승용차 속도 (장거리는 자동 가산)' },
  { key: 'distanceDecayKm', label: '목적지 거리 감쇠 (km)', min: 6, max: 40, step: 1, help: '클수록 먼 업무지구로도 많이 출근' },
  { key: 'localWeight', label: '근거리 통근 비중', min: 0, max: 800, step: 10, help: '거주지 근처로 출근(철도 미이용)하는 비중' },
];

export function SettingsTab() {
  const settings = useStore((s) => s.scenario.settings);
  const setSettings = useStore((s) => s.setSettings);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const resetScenario = useStore((s) => s.resetScenario);
  const toast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<VworldCheckResult | 'running' | null>(null);

  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gimpo-metro-scenario.json';
    a.click();
  };

  return (
    <div className="panel-body">
      <div className="section-title">배경 지도</div>
      <select value={ui.basemap} onChange={(e) => setUi({ basemap: e.target.value as BasemapId })} aria-label="배경 지도">
        {BASEMAPS.map((b) => (
          <option key={b.id} value={b.id} disabled={b.needsKey && !ui.vworldKey}>
            {b.label}
            {b.needsKey && !ui.vworldKey ? ' (키 필요)' : ''}
          </option>
        ))}
      </select>
      <label className="field">
        <span>브이월드 API 키</span>
        <input className="text" type="password" placeholder="vworld.kr 에서 발급한 인증키" value={ui.vworldKey} onChange={(e) => setUi({ vworldKey: e.target.value.trim() })} />
        <span className="muted small">
          키는 이 브라우저에만 저장됩니다. 발급 시 서비스 URL에 <b>{window.location.origin === 'null' ? '사이트 주소' : window.location.origin}</b> 를 등록해야 합니다.
        </span>
      </label>
      <div className="row wrap">
        <button
          disabled={!ui.vworldKey || check === 'running'}
          onClick={async () => {
            setCheck('running');
            setCheck(await checkVworldKey(ui.vworldKey));
          }}
        >
          {check === 'running' ? '확인 중…' : '키 확인'}
        </button>
      </div>
      {check && check !== 'running' && <div className={`check-result ${check.ok ? 'ok' : 'fail'}`}>{check.message}</div>}

      <div className="section-title">시뮬레이션 계수</div>
      {FIELDS.map((f) => (
        <label key={f.key} className="slider-field">
          <span className="sf-head">
            <span>{f.label}</span>
            <b>{settings[f.key]}</b>
          </span>
          <input type="range" min={f.min} max={f.max} step={f.step} value={settings[f.key]} onChange={(e) => setSettings({ [f.key]: Number(e.target.value) })} />
          <span className="muted small">{f.help}</span>
        </label>
      ))}
      <button onClick={() => setSettings(DEFAULT_SETTINGS)}>계수 기본값으로</button>

      <div className="section-title">시나리오 저장 · 불러오기</div>
      <div className="row wrap">
        <button onClick={download}>JSON 내보내기</button>
        <button onClick={() => fileRef.current?.click()}>JSON 불러오기</button>
        <button
          className="danger"
          onClick={() => {
            if (confirm('계획 선택, 내 노선, 단지 수정 내용을 모두 초기화할까요?')) {
              resetScenario();
              toast('초기화했습니다');
            }
          }}
        >
          전체 초기화
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) toast(importJson(await f.text()) ? '시나리오를 불러왔습니다' : '불러오지 못했습니다 (형식 확인)');
            e.target.value = '';
          }}
        />
      </div>

      <div className="section-title">모형과 데이터</div>
      <div className="about">
        <p>
          <b>계산 방식.</b> 단지별 세대수 → 인구 → 아침 출근 인원을 만들고, 업무지구 규모와 거리로 목적지를 나눈 뒤, 철도(걷기·마을버스 접근 + 대기 + 차내 + 환승 +
          혼잡 불편)와 버스·승용차 중 하나를 고르게 합니다. 철도 이용자는 혼잡을 반영한 최단 경로로 여러 번 나눠 배정하고, 구간별 시간당 승객을 정원(열차 횟수 × 열차
          정원)으로 나눈 값이 혼잡도입니다.
        </p>
        <p>
          <b>데이터.</b> 역 좌표: 공공데이터 기반 전국 도시철도 역 정보(2026.6). 행정경계: 통계청(southkorea-maps). 아파트 세대수와 운행 횟수·정원은 공개 자료를 바탕으로 한
          추정치입니다. 계획 노선의 가칭 역은 개략 위치입니다.
        </p>
        <p className="muted small">정책 판단용이 아닌 비교·토론용 도구입니다.</p>
      </div>
    </div>
  );
}
