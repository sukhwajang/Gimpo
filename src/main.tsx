import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { initPersistence } from './state/persist';
import { initSimRunner } from './state/simRunner';
import './styles.css';

try {
  initPersistence();
} catch (e) {
  console.error('설정 불러오기 실패', e);
}
try {
  initSimRunner();
} catch (e) {
  console.error('시뮬레이션 워커 시작 실패', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
