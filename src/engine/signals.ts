export type SignalUnsubscribe = () => void;

export class SignalBus<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  private listeners = new Map<keyof TEvents | string, Set<(payload: never) => void>>();

  public on<K extends keyof TEvents | string>(
    event: K,
    handler: (payload: K extends keyof TEvents ? TEvents[K] : unknown) => void,
  ): SignalUnsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const fn = handler as (payload: never) => void;
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  public once<K extends keyof TEvents | string>(
    event: K,
    handler: (payload: K extends keyof TEvents ? TEvents[K] : unknown) => void,
  ): SignalUnsubscribe {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  public off<K extends keyof TEvents | string>(
    event: K,
    handler: (payload: K extends keyof TEvents | string ? (K extends keyof TEvents ? TEvents[K] : unknown) : unknown) => void,
  ): void {
    this.listeners.get(event)?.delete(handler as (payload: never) => void);
  }

  public emit<K extends keyof TEvents | string>(
    event: K,
    payload: K extends keyof TEvents ? TEvents[K] : unknown,
  ): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      (fn as (p: unknown) => void)(payload);
    }
  }

  public listenerCount(event?: keyof TEvents | string): number {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  public clear(): void {
    this.listeners.clear();
  }
}
