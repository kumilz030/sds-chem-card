import { CONFIG } from '../config.js';
const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const vkey = e => e.kind + (e.kind === 'num' ? e.value : '');
// entries: {raw, kind, value, pressure, temp, source}。回傳狀態與顯示值；衝突時不選值。
export function compare(field, entries, cfg = CONFIG) {
  const other = []; let use = [];
  for (const e of entries) {
    if (e.kind === 'unparsed') other.push({ why: '無法解析', ...e }); // 解析器給的原因（如無單位的相對密度）優先
    else if (field === 'bp' && e.kind === 'num' && e.pressure != null && Math.abs(e.pressure - 760) > 1) other.push({ ...e, why: '非常壓' });
    else if (field === 'density' && e.temp == null) other.push({ ...e, why: '缺溫度' });
    else use.push(e);
  }
  if (field === 'density' && use.length) {
    const t0 = use[0].temp, keep = use.filter(e => Math.abs(e.temp - t0) <= cfg.densityTempWindow);
    use.filter(e => !keep.includes(e)).forEach(e => other.push({ ...e, why: '溫度條件不同' }));
    use = keep;
  }
  const seen = new Set();
  use = use.filter(e => { const k = e.source + '|' + vkey(e); if (seen.has(k)) return false; seen.add(k); return true; });
  const sources = [...new Set(use.map(e => e.source))];
  if (!use.length) return { status: '查無', sources, use, other, shown: null };
  if (sources.length === 1) return { status: '單一來源', sources, use, other, shown: use[0] };
  const tol = cfg.tol[field];
  let ok = true;
  for (let i = 0; i < use.length && ok; i++) for (let j = i + 1; j < use.length && ok; j++) {
    const a = use[i], b = use[j];
    if (a.kind !== b.kind) ok = false;
    else if (a.kind === 'num') ok = field === 'density' ? Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value)) <= tol : Math.abs(a.value - b.value) <= tol;
  }
  if (!ok) return { status: '衝突', sources, use, other, shown: null };
  const shown = use[0].kind === 'num' ? { ...use[0], value: med(use.map(e => e.value)) } : use[0];
  return { status: '一致', sources, use, other, shown };
}
