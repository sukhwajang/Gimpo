/// <reference lib="webworker" />
import { toBaselineInput, toSimInput, type FullInput } from './scenario';
import { simulate, type SimResult } from './simulate';

export interface WorkerRequest {
  id: number;
  input: FullInput;
}

export interface WorkerResponse {
  id: number;
  scenario?: SimResult;
  baseline?: SimResult;
  error?: string;
}

let baselineKey = '';
let baselineCache: SimResult | null = null;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, input } = ev.data;
  try {
    const bKey = JSON.stringify({ h: input.householdOverrides, s: input.settings });
    if (bKey !== baselineKey || !baselineCache) {
      baselineCache = simulate(toBaselineInput(input));
      baselineKey = bKey;
    }
    const scenario = simulate(toSimInput(input));
    const msg: WorkerResponse = { id, scenario, baseline: baselineCache };
    (self as unknown as Worker).postMessage(msg);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String((e as Error)?.stack ?? e) } satisfies WorkerResponse);
  }
};
