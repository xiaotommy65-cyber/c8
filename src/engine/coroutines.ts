import type { CoroutineYield, EasingName } from './types';

export type CoroutineGenerator = Generator<CoroutineYield, void, unknown>;
export type CoroutineFactory = () => CoroutineGenerator;

export interface CoroutineHandle {
  readonly id: number;
  readonly label: string;
  readonly done: boolean;
  cancel: () => void;
}

function applyEase(t: number, easing: EasingName): number {
  const x = Math.max(0, Math.min(1, t));
  if (easing === 'linear') return x;
  if (easing === 'easeIn') return x * x;
  if (easing === 'easeInOut') return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  if (easing === 'easeOutBack') {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  return x;
}

export function* waitTicks(ticks: number): CoroutineGenerator {
  const count = Math.max(1, Math.round(ticks));
  for (let i = 0; i < count; i++) {
    yield { kind: 'ticks', ticks: 1 };
  }
}

export function* wait(seconds: number): CoroutineGenerator {
  const ticks = Math.max(1, Math.round(seconds * 60));
  yield* waitTicks(ticks);
}

export function* waitUntil(predicate: () => boolean, maxSeconds = 30): CoroutineGenerator {
  const maxTicks = Math.max(1, Math.round(maxSeconds * 60));
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    yield { kind: 'ticks', ticks: 1 };
  }
}

export function* tween(
  seconds: number,
  easing: EasingName,
  onStep: (progress: number, rawProgress: number) => void,
): CoroutineGenerator {
  const totalTicks = Math.max(1, Math.round(seconds * 60));
  for (let i = 1; i <= totalTicks; i++) {
    const raw = i / totalTicks;
    onStep(applyEase(raw, easing), raw);
    yield { kind: 'ticks', ticks: 1 };
  }
}

export function* sequence(...branches: Array<CoroutineGenerator | CoroutineFactory>): CoroutineGenerator {
  for (const item of branches) {
    const gen = typeof item === 'function' ? item() : item;
    yield* gen;
  }
}

export function* parallel(...branches: Array<CoroutineGenerator | CoroutineFactory>): CoroutineGenerator {
  const active = branches.map((item) => (typeof item === 'function' ? item() : item));
  while (active.length > 0) {
    for (let i = active.length - 1; i >= 0; i--) {
      const res = active[i].next();
      if (res.done) active.splice(i, 1);
    }
    if (active.length > 0) {
      yield { kind: 'ticks', ticks: 1 };
    }
  }
}

interface ActiveCoroutineTask {
  id: number;
  label: string;
  gen: CoroutineGenerator;
  waitRemaining: number;
  cancelled: boolean;
  done: boolean;
}

export class CoroutineScheduler {
  private nextId = 1;
  private tasks: ActiveCoroutineTask[] = [];
  private onError?: (err: Error, label: string) => void;

  constructor(onError?: (err: Error, label: string) => void) {
    this.onError = onError;
  }

  public spawn(factoryOrGen: CoroutineFactory | CoroutineGenerator, label = 'coroutine'): CoroutineHandle {
    const gen = typeof factoryOrGen === 'function' ? factoryOrGen() : factoryOrGen;
    const task: ActiveCoroutineTask = {
      id: this.nextId++,
      label,
      gen,
      waitRemaining: 0,
      cancelled: false,
      done: false,
    };
    this.tasks.push(task);

    return {
      id: task.id,
      label: task.label,
      get done() {
        return task.done || task.cancelled;
      },
      cancel: () => {
        task.cancelled = true;
      },
    };
  }

  public loop(factory: CoroutineFactory, label = 'loop'): CoroutineHandle {
    const wrapper = function* (): CoroutineGenerator {
      while (true) {
        yield* factory();
        yield { kind: 'ticks', ticks: 1 };
      }
    };
    return this.spawn(wrapper, label);
  }

  public stepTick(): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.cancelled || task.done) {
        this.tasks.splice(i, 1);
        continue;
      }

      if (task.waitRemaining > 0) {
        task.waitRemaining--;
        continue;
      }

      try {
        const result = task.gen.next();
        if (result.done) {
          task.done = true;
          this.tasks.splice(i, 1);
        } else {
          const y = result.value;
          task.waitRemaining = Math.max(0, (y?.ticks ?? 1) - 1);
        }
      } catch (err) {
        task.done = true;
        this.tasks.splice(i, 1);
        const error = err instanceof Error ? err : new Error(String(err));
        this.onError?.(error, task.label);
      }
    }
  }

  public activeCount(): number {
    return this.tasks.filter((t) => !t.done && !t.cancelled).length;
  }

  public clear(): void {
    this.tasks = [];
  }
}
