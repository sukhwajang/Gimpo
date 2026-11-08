import type { WorkerRequest, WorkerResponse } from '../sim/worker';
import { useStore } from './store';

let worker: Worker | null = null;
let seq = 0;
let latest = 0;
let timer: number | undefined;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const { id, scenario, baseline, error } = ev.data;
      if (id !== latest) return;
      if (error) {
        console.error(error);
        useStore.getState().setSim({ running: false, error });
        return;
      }
      useStore.getState().setSim({ running: false, scenario: scenario ?? null, baseline: baseline ?? null, error: null });
    };
  }
  return worker;
}

export function requestSim(delay = 250) {
  window.clearTimeout(timer);
  useStore.getState().setSim({ running: true });
  timer = window.setTimeout(() => {
    const { scenario } = useStore.getState();
    const id = ++seq;
    latest = id;
    const msg: WorkerRequest = { id, input: scenario };
    getWorker().postMessage(msg);
  }, delay);
}

export function initSimRunner() {
  requestSim(0);
  useStore.subscribe((s, prev) => {
    if (s.scenario !== prev.scenario) {
      // 편집 중(정류장 1개 이하) 노선은 결과에 영향이 없지만 단순화를 위해 항상 재계산
      requestSim();
    }
  });
}
