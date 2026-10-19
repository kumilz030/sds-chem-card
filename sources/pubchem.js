import { CONFIG } from '../config.js';
const B = CONFIG.pubchem, e = encodeURIComponent;
const walk = (n, pred, out = []) => { for (const s of n.Section || []) { if (pred(s)) out.push(s); walk(s, pred, out); } return out; };
// 從 PUG View 取出指定 TOCHeading 下的所有條目，附上原始出處（Reference）。
export function extract(report, heading) {
  const rec = report?.Record; if (!rec) return [];
  const refs = new Map((rec.Reference || []).map(r => [r.ReferenceNumber, r]));
  const items = [];
  for (const s of walk(rec, x => x.TOCHeading === heading))
    for (const inf of s.Information || []) {
      const ref = refs.get(inf.ReferenceNumber);
      for (const x of inf.Value?.StringWithMarkup || []) items.push({ name: inf.Name, text: x.String, source: ref?.SourceName ?? '未知來源', url: ref?.URL ?? null });
    }
  return items;
}
export function createPubchem(get) {
  return {
    cidsByName: async n => (await get(`${B}/pug/compound/name/${e(n)}/cids/JSON`))?.IdentifierList?.CID ?? [],
    cidsByFormula: async f => (await get(`${B}/pug/compound/fastformula/${e(f)}/cids/JSON`))?.IdentifierList?.CID ?? [],
    props: async ids => (await get(`${B}/pug/compound/cid/${ids.join(',')}/property/Title,MolecularFormula,MolecularWeight/JSON`))?.PropertyTable?.Properties ?? [],
    synonyms: async id => (await get(`${B}/pug/compound/cid/${id}/synonyms/JSON`))?.InformationList?.Information?.[0]?.Synonym ?? [],
    report: id => get(`${B}/pug_view/data/compound/${id}/JSON`),
    autocomplete: async t => (await get(`${B}/autocomplete/compound/${e(t)}/json?limit=5`))?.dictionary_terms?.compound ?? [],
  };
}
