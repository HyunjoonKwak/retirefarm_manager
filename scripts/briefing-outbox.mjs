// Private, durable delivery state. One token file identifies one local worker.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** @param {string} value */
const hash = value => createHash('sha256').update(value).digest('hex');

/** @param {{ tokenFile: string, endpoint: string, token: string }} config */
export async function openOutbox({ tokenFile, endpoint, token }) {
  const directory = `${path.resolve(tokenFile)}.state`;
  await fs.mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077)) throw new Error('unsafe state directory');
  const lock = path.join(directory, 'worker.lock');
  // Never steal a lock based on age: the owner may still be running inference.
  const handle = await fs.open(lock, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); await handle.sync(); }
  catch (error) { await handle.close(); await fs.unlink(lock); throw error; }
  await handle.close();
  const file = path.join(directory, 'pending.json');
  const binding = hash(`${endpoint}\n${hash(token)}`);
  async function syncDirectory() {
    const dir = await fs.open(directory, 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  }
  return {
    /** @returns {Promise<Record<string, unknown> | null>} */
    async read() {
      try {
        await fs.lstat(path.join(directory, 'pending.next'));
        throw new Error('interrupted pending write');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      let pending;
      try { pending = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      try {
        const info = await pending.stat();
        if (!info.isFile() || (info.mode & 0o077) || info.size > 256 * 1024) throw new Error('unsafe pending file');
        const entry = JSON.parse(await pending.readFile('utf8'));
        if (entry.version !== 1 || entry.binding !== binding) throw new Error('pending binding mismatch');
        return entry;
      } finally { await pending.close(); }
    },
    /** @param {Record<string, unknown>} entry */
    async save(entry) {
      const value = JSON.stringify({ ...entry, version: 1, binding });
      if (Buffer.byteLength(value) > 256 * 1024) throw new Error('pending file too large');
      const temporary = path.join(directory, 'pending.next');
      // A leftover temporary file is evidence of an interrupted write; fail closed.
      const pending = await fs.open(temporary, 'wx', 0o600);
      try { await pending.writeFile(value); await pending.sync(); } finally { await pending.close(); }
      await fs.rename(temporary, file);
      await syncDirectory();
    },
    async clear() { await fs.unlink(file); await syncDirectory(); },
    async close() { await fs.unlink(lock); },
  };
}
