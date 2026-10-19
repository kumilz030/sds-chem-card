const H = /H[0-9]{3}[A-Za-z]{0,2}(\+H[0-9]{3}[A-Za-z]{0,2})*/;
const SIG = { Danger: '危險', Warning: '警告' };
// items: extract(report,'GHS Classification') 的結果。每個代碼只出現一次，全部顯示。
// 同一代碼有多筆時：優先取「有通報比例」的那一筆；多筆都有比例就取第一筆；都沒有才取第一筆。
export function parseGhs(items, table = {}) {
  let signal = null; const byCode = new Map(); // Map 保留首次出現的順序
  for (const it of items) {
    const t = it.text.trim();
    if (it.name === 'Signal' && SIG[t]) { if (!signal || t === 'Danger') signal = t; continue; }
    const m = t.match(new RegExp('^' + H.source));
    if (!m) continue;
    const pct = t.match(/\((\d+(?:\.\d+)?)%\)/)?.[1] ?? null;
    const prev = byCode.get(m[0]);
    if (prev && !(prev.pct == null && pct != null)) continue; // 已有，且新的不比舊的更好
    const en = (t.match(/:\s*(.+)$/)?.[1] ?? t).replace(/\s*\[.*\]\s*$/, '');
    const z = table[m[0]];
    byCode.set(m[0], { code: m[0], pct, en, zh: z?.verified ? z.zh : null, source: it.source });
  }
  return { signal, signalZh: signal ? SIG[signal] : null, codes: [...byCode.values()] };
}
