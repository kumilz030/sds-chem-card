import { CONFIG } from '../config.js';

// 維基百科中文版＋Wikidata：只負責「中文名稱」這件事。
//   中文輸入 → 候選物質（含 PubChem CID／CAS／元素符號、台灣用語中文名）
//   CID／CAS → Wikidata 條目 → 台灣用語中文名（資料卡顯示用）
// 熔點、沸點等化學框物性本模組不處理（見 README）。
// get(url) 由外部注入（限速佇列＋記憶體快取）；toTw(s) 為簡轉繁（台灣用語）轉換函式。
// ⚠ 尚未用真實回應驗證（建置環境連不到維基），見 DECISIONS.md。

const qs = o => Object.entries({ format: 'json', formatversion: 2, origin: '*', ...o })
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// 已是台灣／繁體寫法的標籤直接用；其餘（zh、簡體）與頁面標題一律再過簡轉繁。
const LANGS = ['zh-tw', 'zh-hant', 'zh', 'zh-hans', 'zh-cn'];
const AS_IS = new Set(['zh-tw', 'zh-hant']);

export function pickZhName(ent) {
  for (const l of LANGS) {
    const v = ent?.labels?.[l]?.value;
    if (v) return { name: v, from: l, needsConv: !AS_IS.has(l) };
  }
  const t = ent?.sitelinks?.zhwiki?.title;
  return t ? { name: t, from: 'zhwiki-title', needsConv: true } : null;
}

// 回傳 null 表示「不是化學物質」：沒有 P662（PubChem CID）、P231（CAS）、P246（元素符號）任一項。
export function parseEntity(ent) {
  if (!ent || ent.missing !== undefined) return null;
  const vals = p => (ent.claims?.[p] ?? [])
    .filter(c => c.rank !== 'deprecated')
    .sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'))
    .map(c => c.mainsnak?.datavalue?.value).filter(v => typeof v === 'string' && v);
  const cid = vals('P662')[0] ?? null, cas = vals('P231'), symbol = vals('P246')[0] ?? null;
  if (!cid && !cas.length && !symbol) return null;
  return { cid, cas, symbol, enName: ent.labels?.en?.value ?? null };
}

const usablePage = p => p && !p.missing && !p.invalid && p.pageprops?.wikibase_item && !('disambiguation' in p.pageprops);
const toPage = p => ({ title: p.title, qid: p.pageprops.wikibase_item, revid: p.revisions?.[0]?.revid ?? null, index: p.index ?? 99 });

export function createWikimedia({ get, toTw, cfg = CONFIG.wiki }) {
  const zh = p => `${cfg.zhApi}?${qs(p)}`, wd = p => `${cfg.wdApi}?${qs(p)}`;
  // 維基 API 的錯誤是 HTTP 200＋{error:{…}}，要自己檢查。
  const api = async url => { const r = await get(url); if (r?.error) throw new Error('WIKI_API:' + r.error.code); return r; };
  const pagesOf = r => Object.values(r?.query?.pages ?? {}); // formatversion=2 為陣列，舊格式為物件，兩者都吃

  async function entities(ids) {
    if (!ids.length) return {};
    const r = await api(wd({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|sitelinks',
      languages: 'zh-tw|zh-hant|zh|zh-hans|zh-cn|en', sitefilter: 'zhwiki' }));
    return r?.entities ?? {};
  }
  async function toInfo(qid, ent, extra = {}) {
    const p = parseEntity(ent); if (!p) return null;
    const z = pickZhName(ent);
    const zhName = z ? (z.needsConv ? await toTw(z.name) : z.name) : null;
    return { qid, ...p, zhName, zhNameFrom: z?.from ?? null, converted: !!z && zhName !== z.name,
      title: extra.title ?? ent.sitelinks?.zhwiki?.title ?? null, revid: extra.revid ?? null, fuzzy: extra.fuzzy ?? false };
  }

  return {
    // 中文輸入 → 候選（已排除非化學物質與消歧義頁）。
    // 先用「原樣＋台灣用語轉換」兩種寫法精確比對條目標題（含重新導向）；找不到才退回全文搜尋。
    // 經重新導向（俗名）或搜尋得到的候選標 fuzzy，一律要使用者確認。
    async resolveName(raw) {
      const s = raw.trim(), conv = await toTw(s);
      const r = await api(zh({ action: 'query', titles: [...new Set([s, conv])].join('|'), redirects: 1, converttitles: 1,
        variant: 'zh-tw', prop: 'pageprops|revisions', ppprop: 'wikibase_item|disambiguation', rvprop: 'ids' }));
      let pages = pagesOf(r).filter(usablePage).map(toPage), fuzzy = (r?.query?.redirects ?? []).length > 0;
      if (!pages.length) {
        fuzzy = true;
        const sr = await api(zh({ action: 'query', generator: 'search', gsrsearch: conv, gsrlimit: 5, gsrnamespace: 0,
          variant: 'zh-tw', prop: 'pageprops', ppprop: 'wikibase_item|disambiguation' }));
        pages = pagesOf(sr).filter(usablePage).map(toPage).sort((a, b) => a.index - b.index);
      }
      const qids = [...new Set(pages.map(p => p.qid))], ents = await entities(qids), seen = new Set(), out = [];
      for (const p of pages) {
        if (seen.has(p.qid)) continue; seen.add(p.qid);
        const info = await toInfo(p.qid, ents[p.qid], { title: p.title, revid: p.revid, fuzzy });
        if (info) out.push(info);
      }
      return out;
    },
    // PubChem CID（找不到再用 CAS）→ Wikidata 條目。找不到或 CID 對不上就回 null，不猜。
    async byCid(cid, cas) {
      const find = async stmt => ((await api(wd({ action: 'query', list: 'search', srsearch: `haswbstatement:${stmt}`, srlimit: 3 })))
        ?.query?.search ?? []).map(x => x.title).filter(t => /^Q\d+$/.test(t));
      let qids = await find(`P662=${cid}`);
      if (!qids.length && cas) qids = await find(`P231=${cas}`);
      if (!qids.length) return null;
      const ents = await entities(qids);
      for (const q of qids) {
        const info = await toInfo(q, ents[q]); if (!info) continue;
        if (info.cid ? info.cid !== String(cid) : !(cas && info.cas.includes(cas))) continue;
        return info;
      }
      return null;
    },
  };
}
