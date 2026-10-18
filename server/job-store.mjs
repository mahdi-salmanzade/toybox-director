import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const isJobId = (id) => typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
export const terminalJob = (job) => ['completed', 'failed', 'canceled'].includes(job.status);

// One atomic file per record keeps a crash from destroying the whole library.
export class JobStore {
  constructor(directory) { this.directory = directory; this.writes = new Map(); }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const records = [];
    for (const entry of await readdir(this.directory)) {
      const id = entry.replace(/\.json$/, '');
      if (!isJobId(id) || entry !== `${id}.json`) continue;
      try {
        const record = JSON.parse(await readFile(path.join(this.directory, entry), 'utf8'));
        if (record.version === 1 && record.id === id && ['render', 'movie'].includes(record.kind) && Array.isArray(record.outputs)) records.push(record);
      } catch { console.warn('A damaged library record could not be loaded; its media has been preserved.'); }
    }
    return records;
  }
  save(record) {
    const snapshot = JSON.stringify(record);
    const previous = this.writes.get(record.id) ?? Promise.resolve();
    const writing = previous.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temp = path.join(this.directory, `${record.id}.${randomUUID()}.tmp`);
      await writeFile(temp, snapshot, { mode: 0o600 });
      await rename(temp, path.join(this.directory, `${record.id}.json`));
    });
    this.writes.set(record.id, writing);
    return writing.finally(() => { if (this.writes.get(record.id) === writing) this.writes.delete(record.id); });
  }
  async remove(id) {
    await this.writes.get(id);
    await rm(path.join(this.directory, `${id}.json`), { force: true });
  }
  async flush() { await Promise.allSettled([...this.writes.values()]); }
}

export function publicJob(record) {
  const { id, kind, status, createdAt, updatedAt, metadata = {}, outputs, error, progress, renderSeconds, title } = record;
  return { id, kind, status, createdAt, updatedAt, ...metadata, outputs, ...(error ? { error } : {}), ...(typeof progress === 'number' ? { progress } : {}), ...(renderSeconds !== undefined ? { renderSeconds } : {}), ...(title ? { title } : {}) };
}
