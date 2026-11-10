import { useRef } from 'react';
import { DETAIL_ZONES, DEV_SCENARIOS, SCENARIO_ZONES } from '../data/apartments';
import { useStore } from '../state/store';
import type { Zone } from '../types';
import { fmt } from './format';
import { Icon, Switch } from './kit';

const REGION_ORDER = ['김포', '검단', '인천 서구', '계양', '강서', '양천'];
const ESTIMATED_REGIONS = ['검단', '인천 서구'];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text: string): Zone[] {
  const rows = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (rows.length < 2) return [];
  const head = splitCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = idx(['name', '단지명', '이름']);
  const iLat = idx(['lat', 'latitude', '위도']);
  const iLon = idx(['lon', 'lng', 'longitude', '경도']);
  const iHh = idx(['households', '세대수', 'hh']);
  const iRegion = idx(['region', '지역']);
  if (iLat < 0 || iLon < 0 || iHh < 0) throw new Error('CSV에 위도(lat), 경도(lon), 세대수(households) 열이 필요합니다');
  const out: Zone[] = [];
  rows.slice(1).forEach((r, k) => {
    const c = splitCsvLine(r);
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    const hh = Number(c[iHh]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(hh)) return;
    out.push({
      id: `user-csv-${Date.now().toString(36)}-${k}`,
      name: iName >= 0 ? c[iName].trim() : `CSV 단지 ${k + 1}`,
      lat,
      lon,
      households: Math.max(0, Math.round(hh)),
      source: 'user',
      region: iRegion >= 0 ? c[iRegion]?.trim() || undefined : undefined,
    });
  });
  return out;
}

function download(name: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ZonesTab() {
  const overrides = useStore((s) => s.scenario.householdOverrides);
  const active = useStore((s) => s.scenario.activeScenarios);
  const userZones = useStore((s) => s.scenario.userZones);
  const pph = useStore((s) => s.scenario.settings.personsPerHousehold);
  const setHh = useStore((s) => s.setHouseholds);
  const toggleDev = useStore((s) => s.toggleDevScenario);
  const updateUser = useStore((s) => s.updateUserZone);
  const removeUser = useStore((s) => s.removeUserZone);
  const addUser = useStore((s) => s.addUserZone);
  const edit = useStore((s) => s.ui.edit);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const hh = (z: Zone) => overrides[z.id] ?? z.households;

  const exportCsv = () => {
    const all = [...DETAIL_ZONES, ...SCENARIO_ZONES.filter((z) => active[z.scenario!]), ...userZones];
    const lines = ['name,region,lat,lon,households', ...all.map((z) => `${z.name},${z.region ?? ''},${z.lat},${z.lon},${hh(z)}`)];
    download('gimpo-apartments.csv', '﻿' + lines.join('\n'), 'text/csv');
  };

  const onFile = async (f: File) => {
    try {
      const zones = parseCsv(await f.text());
      if (!zones.length) throw new Error('읽을 수 있는 행이 없습니다');
      zones.forEach(addUser);
      // 같은 지역의 추정 단지군과 중복되지 않도록
      const regions = [...new Set(zones.map((z) => z.region).filter((r): r is string => !!r && REGION_ORDER.includes(r)))];
      if (regions.length && confirm(`CSV에 ${regions.join('·')} 지역 단지가 있습니다. 이 지역의 추정 단지군을 0세대로 바꿔 중복 계산을 막을까요?`)) {
        DETAIL_ZONES.filter((z) => z.region && regions.includes(z.region)).forEach((z) => setHh(z.id, 0));
      }
      toast(`${zones.length}개 단지를 추가했습니다`);
    } catch (e) {
      toast(String((e as Error).message));
    }
  };

  return (
    <div className="tab-body">
      <section>
        <header className="sec-head">
          <h2>개발 예정 단지</h2>
          <span className="count">
            {DEV_SCENARIOS.filter((d) => active[d.id]).length} / {DEV_SCENARIOS.length} 켜짐
          </span>
        </header>
        <p className="sec-desc">입주를 가정해 수요에 더합니다. 지도에는 분홍색 기둥으로 나타납니다.</p>
        {DEV_SCENARIOS.map((d) => {
          const total = SCENARIO_ZONES.filter((z) => z.scenario === d.id).reduce((a, z) => a + hh(z), 0);
          return (
            <article key={d.id} className={`plan dev ${active[d.id] ? 'on' : ''}`}>
              <div className="plan-head">
                <div className="plan-main static">
                  <span className="plan-name">{d.name}</span>
                  <span className="plan-meta">
                    <span className="badge">{d.status}</span>
                    <span className="plan-year">{fmt(total)}세대</span>
                  </span>
                </div>
                <Switch checked={!!active[d.id]} onChange={() => toggleDev(d.id)} label={`${d.name} ${active[d.id] ? '끄기' : '켜기'}`} />
              </div>
              <p className="dev-desc">{d.description}</p>
            </article>
          );
        })}
      </section>

      <section>
        <header className="sec-head">
          <h2>내가 추가한 단지</h2>
          {userZones.length > 0 && <span className="count">{userZones.length}개</span>}
        </header>
        {userZones.length > 0 && (
          <div className="list">
            {userZones.map((z) => (
              <div key={z.id} className="zone-row user">
                <input className="text grow" value={z.name} onChange={(e) => updateUser(z.id, { name: e.target.value })} aria-label="단지 이름" />
                <span className="num-input">
                  <input type="number" value={z.households} min={0} step={100} onChange={(e) => updateUser(z.id, { households: Math.max(0, Number(e.target.value) || 0) })} aria-label="세대수" />
                  <em>세대</em>
                </span>
                <button className="icon-btn danger" onClick={() => removeUser(z.id)} aria-label={`${z.name} 삭제`}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="btn-row">
          <button className={`btn ${edit.kind === 'zone' ? 'primary' : 'dashed'}`} onClick={() => setUi({ edit: edit.kind === 'zone' ? { kind: 'none' } : { kind: 'zone' } })}>
            <Icon name="pin" /> {edit.kind === 'zone' ? '지도를 클릭하세요 (취소)' : '지도에서 단지 추가'}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> CSV 불러오기
          </button>
          <button className="btn" onClick={exportCsv}>
            <Icon name="download" /> CSV 내보내기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">CSV 열: name, lat, lon, households (선택: region). 공공데이터포털 공동주택 자료를 넣으면 실제 세대수로 계산합니다.</p>
      </section>

      <section>
        <header className="sec-head">
          <h2>생활권별 아파트 세대수</h2>
        </header>
        <p className="sec-desc">숫자를 바꾸면 바로 다시 계산합니다.</p>
        {REGION_ORDER.map((region) => {
          const zones = DETAIL_ZONES.filter((z) => z.region === region);
          const sum = zones.reduce((a, z) => a + hh(z), 0);
          return (
            <details key={region} className="region" open={region === '김포'}>
              <summary>
                <span className="region-name">
                  {region} {ESTIMATED_REGIONS.includes(region) && <span className="tag">추정</span>}
                </span>
                <span className="list-meta">
                  {fmt(sum)}세대 · 약 {fmt(sum * pph)}명
                </span>
                <Icon name="chevronDown" size={14} />
              </summary>
              <div className="region-body">
                {zones.map((z) => (
                  <div key={z.id} className="zone-row">
                    <span className="zone-name">{z.name}</span>
                    {overrides[z.id] !== undefined && (
                      <button className="icon-btn" onClick={() => setHh(z.id, null)} title={`기본값 ${fmt(z.households)}세대로 되돌리기`} aria-label="기본값으로 되돌리기">
                        <Icon name="reset" size={13} />
                      </button>
                    )}
                    <span className="num-input">
                      <input type="number" value={hh(z)} min={0} step={500} onChange={(e) => setHh(z.id, Number(e.target.value) || 0)} aria-label={`${z.name} 세대수`} />
                      <em>세대</em>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        <p className="hint">
          김포·계양·강서·양천은 단지별 세대수를 동 단위로 합산한 값이고, 검단·인천 서구는 추정치입니다. 그 밖의 서울·인천·경기 지역은 시군구 가구 수를 역별로 나눈 배경 수요로 계산합니다
          (지도에는 표시하지 않음).
        </p>
      </section>
    </div>
  );
}
