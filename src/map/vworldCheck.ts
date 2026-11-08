// 브이월드 키 진단: 서울 부근 타일 하나를 받아 보고 원인을 구분한다.
//  1) fetch(CORS) 성공 + 이미지   → 정상
//  2) fetch 성공 + 이미지 아님      → 브이월드 오류 응답(키·도메인 문제) 내용 표시
//  3) fetch 실패 + <img> 로는 성공 → 키는 맞지만 CORS 허용이 없어 WebGL 지도에 못 씀
//  4) 둘 다 실패                    → 키 또는 등록 도메인 문제, 혹은 접속 불가

export interface VworldCheckResult {
  ok: boolean;
  message: string;
}

const TEST_TILE = { z: 10, y: 396, x: 873 }; // 서울 도심

export function vworldTileUrl(key: string, layer = 'Base', ext = 'png', t = TEST_TILE): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/${layer}/${t.z}/${t.y}/${t.x}.${ext}`;
}

function loadImg(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), 10000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  });
}

export async function checkVworldKey(key: string): Promise<VworldCheckResult> {
  const origin = window.location.origin === 'null' ? '파일로 연 페이지(file://)' : window.location.origin;
  if (!key) return { ok: false, message: '키를 먼저 입력하세요.' };
  const url = vworldTileUrl(key);
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.startsWith('image/')) {
      return { ok: true, message: '정상입니다. 타일을 받았습니다. 위 배경 지도에서 "브이월드 …"를 고르세요.' };
    }
    const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 240);
    return {
      ok: false,
      message: `브이월드가 오류를 돌려줬습니다 (HTTP ${res.status}). 키가 맞는지, 키의 서비스 URL이 ${origin} 인지 확인하세요. 응답: ${text || '(내용 없음)'}`,
    };
  } catch {
    const imgOk = await loadImg(url);
    if (imgOk) {
      return {
        ok: false,
        message:
          '키와 도메인은 정상이지만, 브이월드 서버가 교차 출처(CORS) 허용 헤더를 보내지 않아 3D 지도 엔진(WebGL)이 타일을 쓸 수 없습니다. 이 경우 중계 서버(프록시)가 필요합니다.',
      };
    }
    return {
      ok: false,
      message: `타일 요청이 거절됐습니다. ① 키를 정확히 붙여 넣었는지 ② 키의 서비스 URL이 ${origin} 인지 ③ 키 상태가 '사용'인지 확인하세요.`,
    };
  }
}
