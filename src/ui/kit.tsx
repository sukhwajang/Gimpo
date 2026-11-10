import type { CSSProperties, ReactNode } from 'react';
import { congestionClass } from '../map/colors';

const PATHS: Record<string, ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.4-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  layers: <path d="m12 2 10 5-10 5L2 7ZM2 12l10 5 10-5M2 17l10 5 10-5" />,
  play: <path d="M7 4.5v15l12-7.5Z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none" />,
  reset: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M19 12l-7 7-7-7" />,
  check: <path d="M20 6 9 17l-5-5" />,
  chart: <path d="M3 3v18h18M8 16v-4M12.5 16V8M17 16v-7" />,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  external: <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span />
    </label>
  );
}

/** 혼잡 단계 표시: 색 점 + 단계 이름 (글자는 본문색) */
export function LevelPill({ ratio }: { ratio: number }) {
  const c = congestionClass(ratio);
  return (
    <span className="pill">
      <i style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

export function LineDot({ color, dashed }: { color: string; dashed?: boolean }) {
  return <i className={`line-dot ${dashed ? 'dashed' : ''}`} style={{ '--c': color } as CSSProperties} />;
}

export function Logo() {
  return (
    <svg className="logo" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#141b2c" />
      <path d="M7 23.5 13 14l6.5 6L27 9.5" fill="none" stroke="#d9b23a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 27h20" stroke="#5b8def" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1 4.2" />
      <circle cx="13" cy="14" r="2.5" fill="#0f1420" stroke="#fff" strokeWidth="1.6" />
      <circle cx="19.5" cy="20" r="2.5" fill="#0f1420" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}
