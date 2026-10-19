// 只存在記憶體，重新整理即清空。
export function createCache() {
  const m = new Map();
  return {
    get(key, fn) {
      if (!m.has(key)) m.set(key, fn().catch(e => { m.delete(key); throw e; }));
      return m.get(key);
    },
    size: () => m.size,
  };
}
