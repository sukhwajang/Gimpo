import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** 앱 전체가 흰 화면이 되지 않도록 오류 내용과 복구 버튼을 보여준다 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fatal">
        <div className="fatal-card">
          <h2>화면을 그리는 중 오류가 났습니다</h2>
          <p className="muted">아래 내용을 알려주시면 원인을 찾는 데 도움이 됩니다.</p>
          <pre>{String(error.message || error)}</pre>
          <div className="row wrap">
            <button className="primary" onClick={() => location.reload()}>
              새로고침
            </button>
            <button
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith('gimpo-metro-sim'))
                    .forEach((k) => localStorage.removeItem(k));
                } catch {
                  /* 저장소 사용 불가 */
                }
                location.hash = '';
                location.reload();
              }}
            >
              저장된 설정 지우고 새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
