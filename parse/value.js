// 純程式解析，不使用 LLM。無法解析就標 unparsed，不猜數字。
const PRES = { atm: 760, mmhg: 1, torr: 1, kpa: 7.50062, pa: 0.00750062, bar: 750.062 };
const PRE_RE = /(\d+(?:\.\d+)?)\s*(mm\s?hg|torr|atm|kpa|pa|bar)\b/i;
const N = '[-−–]?\\d+(?:\\.\\d+)?', toNum = x => parseFloat(x.replace(/[−–]/, '-'));
const toC = (v, u) => (u === 'F' ? (v - 32) * 5 / 9 : u === 'K' ? v - 273.15 : v);
export function parsePressure(raw) {
  const m = raw.match(PRE_RE);
  return m ? Number(m[1]) * PRES[m[2].toLowerCase().replace(/\s/g, '')] : null;
}
export function parseTemp(raw) {
  if (/decompos|分解/i.test(raw)) return { raw, kind: 'decomp' };
  if (/sublim|昇華|升華/i.test(raw)) return { raw, kind: 'subl' };
  const p = parsePressure(raw), s = raw.replace(PRE_RE, '');
  const m = s.match(new RegExp(`(${N})(?:\\s*(?:to|~)\\s*(${N}))?\\s*(?:°|º|deg(?:rees)?\\s*)?([CFK])\\b`, 'i'));
  if (!m) return { raw, kind: 'unparsed' };
  const a = toNum(m[1]), b = m[2] ? toNum(m[2]) : a, u = m[3].toUpperCase();
  return { raw, kind: 'num', value: toC((a + b) / 2, u), pressure: p };
}
// 密度單位：g/cm³、g/mL、g/cc，以及 PubChem（HSDB 等）常見的 g/cu cm、kg/cu m。
const DENSITY_RE = /(\d+(?:\.\d+)?)\s*(kg\/(?:cu\.?\s*m|m(?:3|³))|g\/(?:cu\.?\s*cm|cm(?:3|³)|cc|ml))(?![\w³])/i;
export function parseDensity(raw) {
  const m = raw.match(DENSITY_RE);
  // 沒有單位的數字（如 0.791、0.79）是相對密度（比重），不是 g/cm³，一律排除，不猜。
  if (!m) return { raw, kind: 'unparsed', why: /\d/.test(raw) ? '無密度單位（可能是相對密度）' : '無法解析' };
  const v = Number(m[1]) / (/^kg/i.test(m[2]) ? 1000 : 1);
  const t = raw.replace(m[0], '').match(/(-?\d+(?:\.\d+)?)\s*(?:°|º|deg(?:rees)?\s*)?([CFK])\b/i);
  return { raw, kind: 'num', value: v, temp: t ? toC(Number(t[1]), t[2].toUpperCase()) : null };
}
