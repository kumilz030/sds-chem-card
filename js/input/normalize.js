export function normalize(s) {
  let t = String(s ?? '').trim().normalize('NFKC'); // NFKC 已將 H₂O 轉為 H2O
  if (/^[A-Za-z0-9().*•・·]+$/.test(t)) t = t.replace(/[.*•・]/g, '·');
  return t;
}
