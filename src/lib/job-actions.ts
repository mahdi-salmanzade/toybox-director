export type JobAction = 'cancel' | 'retry' | 'delete';

// Lives with the library hook rather than a shelf row, so navigation cannot
// submit a second retry while the first request is still in flight.
export function createJobActionGate() {
  const pending = new Map<string, { action: JobAction; promise: Promise<void> }>();
  return (id: string, action: JobAction, perform: () => Promise<void>): Promise<void> => {
    const existing = pending.get(id);
    if (existing) {
      if (existing.action !== action) return Promise.reject(new Error('Another action is still running for this render. Wait for it to finish, then try again.'));
      return existing.promise;
    }
    // Start on the next microtask so the gate is registered even when perform
    // throws synchronously. Only the task that owns this slot may release it.
    const promise = Promise.resolve().then(perform).finally(() => {
      if (pending.get(id)?.promise === promise) pending.delete(id);
    });
    pending.set(id, { action, promise });
    return promise;
  };
}
