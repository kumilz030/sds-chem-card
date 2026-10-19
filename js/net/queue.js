// 限速佇列：起始間隔、並行上限、逾時、429/503 指數退避。fetchImpl 與 sleep 可注入以便測試。
export function createQueue({ minGapMs, maxConcurrent, timeoutMs, retries, fetchImpl = (...a) => fetch(...a), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  let active = 0, last = 0; const waiting = []; const q = { count: 0 };
  async function acquire() {
    while (active >= maxConcurrent) await new Promise(r => waiting.push(r));
    active++;
    const t = Math.max(Date.now(), last + minGapMs); last = t;
    if (t > Date.now()) await sleep(t - Date.now());
  }
  const release = () => { active--; waiting.shift()?.(); };
  q.request = async (url, signal) => {
    for (let a = 0; a <= retries; a++) {
      await acquire();
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
      signal?.addEventListener('abort', () => ac.abort());
      try {
        q.count++;
        const res = await fetchImpl(url, { signal: ac.signal });
        if (res.status === 404 || res.status === 400) return null; // 查無
        if (res.ok) return await res.json();
      } catch (e) { if (signal?.aborted) throw e; }
      finally { clearTimeout(timer); release(); }
      if (a < retries) await sleep(1000 * 2 ** a + Math.random() * 250);
    }
    throw new Error('BUSY');
  };
  return q;
}
