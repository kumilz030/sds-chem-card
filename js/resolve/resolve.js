import { classify } from '../input/classify.js';
import { hill } from '../input/formula.js';
export const MSG = {
  oos: '只能搜尋純物質，包含元素與水合物。', many: '找到多個可能的物質，請選擇：', fuzzy: '找不到完全相符的物質，您是否指：',
  badcas: 'CAS 號碼檢查碼錯誤', none: s => `查無此物質：${s}`, busy: 'PubChem 暫時忙碌，請稍後再試',
  empty: '請輸入物質名稱、CAS 或化學式',
  wikiBusy: '維基百科暫時無法連線，無法查詢中文名稱；請改用英文名、CAS 或化學式。',
};
const isWikiErr = x => /^WIKI/.test(x?.message ?? '');
async function cidByCas(pc, cas) {
  for (const id of (await pc.cidsByName(cas)).slice(0, 10)) if ((await pc.synonyms(id)).includes(cas)) return id;
  return null;
}
// 中文名：維基百科／Wikidata → PubChem CID。不靠猜：CID 取自 Wikidata P662，或 CAS 經 PubChem 同義詞核對；
// 只有元素（無 CID、無 CAS）才用英文標籤查名稱，且 PubChem 標題必須與標籤一致才收。
async function resolveCjk(c, { pc, wiki }) {
  if (!wiki) return { kind: 'msg', msg: MSG.none(c.s), note: '中文名查詢需要維基百科模組。' };
  let found;
  try { found = await wiki.resolveName(c.s); } catch (x) { if (isWikiErr(x)) return { kind: 'msg', msg: MSG.wikiBusy }; throw x; }
  const rows = [], seen = new Set();
  for (const f of found) {
    let cid = f.cid ? Number(f.cid) : null, viaName = false;
    for (const cas of cid ? [] : f.cas) { cid = await cidByCas(pc, cas); if (cid) break; }
    if (!cid && f.symbol && f.enName) { cid = (await pc.cidsByName(f.enName))[0] ?? null; viaName = true; }
    if (cid && !seen.has(cid)) { seen.add(cid); rows.push({ f, cid, viaName }); }
  }
  if (!rows.length) return { kind: 'msg', msg: MSG.none(c.s) };
  const byId = new Map((await pc.props(rows.map(r => r.cid))).map(p => [p.CID, p]));
  const cands = rows.flatMap(({ f, cid, viaName }) => {
    const p = byId.get(cid);
    if (!p || (viaName && p.Title?.toLowerCase() !== f.enName.toLowerCase())) return [];
    return [{ cid, zhName: f.zhName, enName: p.Title, formula: p.MolecularFormula, mw: p.MolecularWeight, cas: null, qid: f.qid,
      wikiTitle: f.title, wikiRevid: f.revid, zhNameFrom: f.zhNameFrom, converted: f.converted, fuzzy: f.fuzzy }];
  });
  if (!cands.length) return { kind: 'msg', msg: MSG.none(c.s) };
  if (cands.length === 1 && !cands[0].fuzzy) return { kind: 'one', cand: cands[0] };
  return { kind: 'choose', cands, msg: cands.some(x => x.fuzzy) ? MSG.fuzzy : MSG.many };
}
export async function resolve(raw, { pc, rules, elements, wiki }) {
  const c = classify(raw, rules, elements);
  if (c.type === 'empty') return { kind: 'msg', msg: MSG.empty };
  if (c.type === 'oos') return { kind: 'msg', msg: MSG.oos };
  if (c.type === 'badcas') return { kind: 'msg', msg: MSG.badcas };
  if (c.type === 'cjk') return resolveCjk(c, { pc, wiki });
  let cids = [], fuzzy = false;
  if (c.type === 'cas') {
    for (const id of (await pc.cidsByName(c.s)).slice(0, 10)) if ((await pc.synonyms(id)).includes(c.s)) cids.push(id);
  } else {
    if (c.type === 'formula') cids = await pc.cidsByFormula(hill(c.counts));
    if (c.type === 'name' || c.alsoName) cids = [...new Set([...cids, ...await pc.cidsByName(c.s)])];
  }
  if (!cids.length && c.type === 'name') {
    for (const t of (await pc.autocomplete(c.s)).slice(0, 5)) { const ids = await pc.cidsByName(t); if (ids[0]) cids.push(ids[0]); }
    cids = [...new Set(cids)]; fuzzy = cids.length > 0;
  }
  if (!cids.length) return { kind: 'msg', msg: MSG.none(c.s) };
  const cands = (await pc.props(cids.slice(0, 10))).map(p => ({
    cid: p.CID, zhName: null, enName: p.Title, formula: p.MolecularFormula, mw: p.MolecularWeight,
    cas: c.type === 'cas' ? c.s : null, qid: null, wikiTitle: null, fuzzy }));
  if (cands.length === 1 && !fuzzy) return { kind: 'one', cand: cands[0] };
  return { kind: 'choose', cands, msg: fuzzy ? MSG.fuzzy : MSG.many };
}
