export function parseFormula(str, elements) {
  if (!str) return null;
  try {
    const total = {};
    for (const part of str.split('·')) {
      const m = part.match(/^(\d+)?(.+)$/);
      if (!m) return null;
      const coef = m[1] ? Number(m[1]) : 1, s = m[2];
      let i = 0;
      const num = () => { const n = s.slice(i).match(/^\d+/); if (!n) return 1; i += n[0].length; return Number(n[0]); };
      const group = () => {
        const o = {};
        while (i < s.length) {
          const ch = s[i];
          if (ch === '(') {
            i++; const inner = group();
            if (s[i] !== ')') throw 0;
            i++; const n = num();
            for (const k in inner) o[k] = (o[k] || 0) + inner[k] * n;
          } else if (ch === ')') return o;
          else if (/[A-Z]/.test(ch)) {
            let sym = ch; i++;
            if (/[a-z]/.test(s[i] || '')) sym += s[i++];
            if (!elements.has(sym)) throw 0;
            o[sym] = (o[sym] || 0) + num();
          } else throw 0;
        }
        return o;
      };
      const c = group();
      if (i < s.length || !Object.keys(c).length) return null;
      for (const k in c) total[k] = (total[k] || 0) + c[k] * coef;
    }
    return total;
  } catch { return null; }
}
export function hill(c) {
  const keys = Object.keys(c);
  const rest = keys.filter(k => k !== 'C' && k !== 'H').sort();
  const order = c.C ? ['C', ...(c.H ? ['H'] : []), ...rest] : keys.sort();
  return order.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
}
