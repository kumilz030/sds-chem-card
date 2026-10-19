export const CAS_RE = /^[0-9]{2,7}-[0-9]{2}-[0-9]$/;
export function validCas(s) {
  if (!CAS_RE.test(s)) return false;
  const d = s.replace(/-/g, ''), body = d.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i + 1);
  return sum % 10 === Number(d.at(-1));
}
