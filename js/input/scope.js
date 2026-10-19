export function isOutOfScope(s, rules) {
  const t = s.toLowerCase();
  return rules.words.some(w => t.includes(w.toLowerCase())) ||
    rules.names.some(n => s.includes(n)) || /\d+(\.\d+)?\s*%/.test(s);
}
