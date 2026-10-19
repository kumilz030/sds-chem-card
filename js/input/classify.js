import { normalize } from './normalize.js';
import { validCas, CAS_RE } from './cas.js';
import { parseFormula } from './formula.js';
import { isOutOfScope } from './scope.js';
export function classify(raw, rules, elements) {
  const s = normalize(raw);
  if (!s) return { type: 'empty', s };
  if (isOutOfScope(s, rules)) return { type: 'oos', s };
  if (CAS_RE.test(s)) return { type: validCas(s) ? 'cas' : 'badcas', s };
  const counts = parseFormula(s, elements);
  if (counts) return { type: 'formula', s, counts, alsoName: /^[A-Za-z]+$/.test(s) };
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s)) return { type: 'cjk', s };
  return { type: 'name', s };
}
