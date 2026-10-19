// ⚠ 這裡的維基／Wikidata／PubChem 回應是「依 API 文件結構手寫的模擬資料」，只用來測我們自己的邏輯
// （候選排除、簡轉繁、重新導向標 fuzzy、CID 對不上就丟棄…），不是 fixture，也不能證明真實回應長這樣。
// 真實驗證待有網路時用 scripts/record-fixtures.mjs 錄製（見 DECISIONS.md）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWikimedia, parseEntity, pickZhName } from '../../js/sources/wikimedia.js';
import { resolve } from '../../js/resolve/resolve.js';
import { ELEMENTS } from '../../js/input/elements.js';
import { renderCard } from '../../js/render/card.js';
import * as OpenCC from '../../vendor/opencc-js/cn2t.js';

const toTw = async s => OpenCC.Converter({ from: 'cn', to: 'twp' })(s);
const rules = JSON.parse(readFileSync(new URL('../../data/out-of-scope.json', import.meta.url)));
const claim = (v, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: v } } });
const label = (l, v) => ({ [l]: { language: l, value: v } });
const ENT = {
  Q1001: { claims: { P662: [claim('180')], P231: [claim('67-64-1')] }, labels: { ...label('zh', '丙酮'), ...label('en', 'acetone') }, sitelinks: { zhwiki: { title: '丙酮' } } },
  Q1002: { claims: { P662: [claim('24462')], P231: [claim('7758-98-7')] }, labels: { ...label('zh-cn', '硫酸铜'), ...label('en', 'copper(II) sulfate') } },
  Q1003: { claims: { P246: [claim('Fe')] }, labels: { ...label('zh-tw', '鐵'), ...label('en', 'iron') } },
  Q1004: { claims: {}, labels: label('zh', '台北') }, // 不是化學物質
};
const page = (title, qid, extra = {}) => ({ pageid: 1, title, pageprops: { wikibase_item: qid }, revisions: [{ revid: 777 }], ...extra });
// 依網址參數回應的假 get：只認 action／titles／generator／haswbstatement／ids。
function fakeGet(handlers, calls = []) {
  return async url => {
    calls.push(url); const u = new URL(url), p = Object.fromEntries(u.searchParams);
    if (p.action === 'wbgetentities') return { entities: Object.fromEntries(p.ids.split('|').map(id => [id, ENT[id] ?? { missing: '' }])) };
    for (const h of handlers) { const r = h(p, u); if (r !== undefined) return r; }
    return { query: { pages: [] } };
  };
}
const wikiWith = handlers => createWikimedia({ get: fakeGet(handlers), toTw });

test('parseEntity／pickZhName', () => {
  assert.deepEqual(parseEntity(ENT.Q1001), { cid: '180', cas: ['67-64-1'], symbol: null, enName: 'acetone' });
  assert.equal(parseEntity(ENT.Q1004), null);
  assert.equal(parseEntity({ missing: '' }), null);
  assert.equal(parseEntity({ claims: { P662: [claim('1', 'deprecated')] } }), null);
  assert.deepEqual(pickZhName(ENT.Q1003), { name: '鐵', from: 'zh-tw', needsConv: false });
  assert.equal(pickZhName(ENT.Q1002).needsConv, true);
  assert.equal(pickZhName({ sitelinks: { zhwiki: { title: 'X' } } }).from, 'zhwiki-title');
});
test('resolveName：標題精確命中 → 非 fuzzy；簡體經 OpenCC 轉成台灣繁體', async () => {
  const w = wikiWith([p => p.titles && { query: { pages: p.titles.split('|').includes('丙酮') ? [page('丙酮', 'Q1001')]
    : p.titles.split('|').includes('硫酸銅') ? [page('硫酸銅', 'Q1002')] : [{ title: p.titles, missing: true }] } }]);
  const [a] = await w.resolveName('丙酮'); assert.equal(a.qid, 'Q1001'); assert.equal(a.cid, '180'); assert.equal(a.fuzzy, false);
  assert.equal(a.revid, 777); assert.equal(a.zhName, '丙酮');
  const [b] = await w.resolveName('硫酸铜'); assert.equal(b.zhName, '硫酸銅'); assert.equal(b.converted, true); assert.equal(b.fuzzy, false);
});
test('resolveName：重新導向（俗名）標 fuzzy；消歧義頁與非化學物質被排除', async () => {
  const w = wikiWith([p => p.titles && { query: { redirects: [{ from: '酒精', to: '乙醇' }], pages: [
    page('乙醇', 'Q1001'), page('酒精 (消歧義)', 'Q1001', { pageprops: { wikibase_item: 'Q1001', disambiguation: '' } }), page('台北', 'Q1004')] } }]);
  const r = await w.resolveName('酒精'); assert.equal(r.length, 1); assert.equal(r[0].title, '乙醇'); assert.equal(r[0].fuzzy, true);
});
test('resolveName：標題查無 → 退回搜尋，依 index 排序並標 fuzzy', async () => {
  const w = wikiWith([p => p.generator === 'search' && { query: { pages: [page('鐵', 'Q1003', { index: 2 }), page('丙酮', 'Q1001', { index: 1 })] } },
    p => p.titles && { query: { pages: [{ title: p.titles, missing: true }] } }]);
  const r = await w.resolveName('丙銅'); assert.deepEqual(r.map(x => x.title), ['丙酮', '鐵']); assert(r.every(x => x.fuzzy));
});
test('byCid：以 P662 找；CID 對不上就丟棄；P662 無結果才用 CAS', async () => {
  const hs = stmt => p => p.list === 'search' && { query: { search: (stmt[p.srsearch] ?? []).map(t => ({ title: t })) } };
  assert.equal((await wikiWith([hs({ 'haswbstatement:P662=180': ['Q1001'] })]).byCid(180, '67-64-1')).zhName, '丙酮');
  assert.equal(await wikiWith([hs({ 'haswbstatement:P662=180': ['Q1002'] })]).byCid(180, null), null); // CID 24462 ≠ 180
  assert.equal((await wikiWith([hs({ 'haswbstatement:P231=67-64-1': ['Q1001'] })]).byCid(180, '67-64-1')).qid, 'Q1001');
  assert.equal(await wikiWith([hs({})]).byCid(180, '67-64-1'), null);
});
test('維基 API 回 error 時丟出 WIKI_API', async () => {
  const w = createWikimedia({ get: async () => ({ error: { code: 'ratelimited' } }), toTw });
  await assert.rejects(w.resolveName('丙酮'), /WIKI_API:ratelimited/);
});

// resolve（中文）：PubChem 端用假的 pc。
const pc = (over = {}) => ({
  cidsByName: async n => ({ 'Iron': [23925], 'iron': [23925], '7758-98-7': [24462] })[n] ?? [], synonyms: async id => (id === 24462 ? ['7758-98-7'] : []),
  props: async ids => ids.map(i => ({ CID: i, Title: ({ 180: 'Acetone', 24462: 'Copper sulfate', 23925: 'Iron' })[i], MolecularFormula: 'X', MolecularWeight: '1' })), ...over });
const R = (raw, wiki) => resolve(raw, { pc: pc(), rules, elements: ELEMENTS, wiki });
test('resolve：中文名 → 1 筆非 fuzzy 直接查；候選帶中文名與維基資訊', async () => {
  const wiki = { resolveName: async () => [{ qid: 'Q1001', cid: '180', cas: ['67-64-1'], symbol: null, enName: 'acetone', zhName: '丙酮', zhNameFrom: 'zh', converted: false, title: '丙酮', revid: 777, fuzzy: false }] };
  const r = await R('丙酮', wiki); assert.equal(r.kind, 'one');
  assert.deepEqual([r.cand.cid, r.cand.zhName, r.cand.enName, r.cand.qid, r.cand.wikiTitle, r.cand.wikiRevid], [180, '丙酮', 'Acetone', 'Q1001', '丙酮', 777]);
});
test('resolve：fuzzy 即使只有一筆也要使用者選', async () => {
  const wiki = { resolveName: async () => [{ qid: 'Q1001', cid: '180', cas: [], enName: 'acetone', zhName: '丙酮', title: '丙酮', fuzzy: true }] };
  const r = await R('丙銅', wiki); assert.equal(r.kind, 'choose'); assert.equal(r.cands.length, 1);
});
test('resolve：沒有 CID 時用 CAS 經 PubChem 同義詞核對；元素用英文標籤且標題須相符', async () => {
  const w1 = { resolveName: async () => [{ qid: 'Q1002', cid: null, cas: ['7758-98-7'], symbol: null, enName: 'copper(II) sulfate', zhName: '硫酸銅', title: null, fuzzy: false }] };
  const r1 = await R('硫酸铜', w1); assert.equal(r1.kind, 'one'); assert.equal(r1.cand.cid, 24462);
  const w2 = { resolveName: async () => [{ qid: 'Q1003', cid: null, cas: [], symbol: 'Fe', enName: 'iron', zhName: '鐵', title: '鐵', fuzzy: false }] };
  assert.equal((await R('鐵', w2)).cand.cid, 23925);
  const p3 = pc({ props: async ids => ids.map(i => ({ CID: i, Title: 'Iron(III) oxide' })) }); // 標題對不上 → 不收
  const r3 = await resolve('鐵', { pc: p3, rules, elements: ELEMENTS, wiki: w2 }); assert.equal(r3.kind, 'msg');
  const w4 = { resolveName: async () => [{ qid: 'Q1005', cid: null, cas: ['1-1-1'], symbol: null, enName: 'x', zhName: 'X', fuzzy: false }] };
  assert.equal((await R('X甲', w4)).kind, 'msg'); // CAS 核對不到 → 查無，不猜
});
test('resolve：維基查無／連線失敗給固定訊息；範圍外與檢查碼仍不發請求', async () => {
  assert.match((await R('不存在的東西', { resolveName: async () => [] })).msg, /查無此物質/);
  const bad = await R('丙酮', { resolveName: async () => { throw new Error('WIKI_BUSY'); } });
  assert.match(bad.msg, /維基百科暫時無法連線/);
  await assert.rejects(R('丙酮', { resolveName: async () => { throw new Error('BUSY'); } }), /BUSY/); // 非維基錯誤不吞掉
  let hit = 0; const wiki = { resolveName: async () => { hit++; return []; } };
  assert.equal((await R('鹽酸', wiki)).msg, '只能搜尋純物質，包含元素與水合物。'); assert.equal(hit, 0);
});
test('資料卡：維基來源與 CC BY-SA 署名；失敗時標示暫時無法連線', () => {
  const empty = { status: '查無', sources: [], use: [], other: [], shown: null };
  const base = { cid: 180, enName: 'Acetone', cas: '67-64-1', formula: 'C3H6O', mw: '58', fields: { mp: empty, bp: empty, density: empty }, text: { solubility: [], appearance: [] }, ghs: { codes: [], signal: null } };
  const t = renderCard({ ...base, zhName: '丙酮', qid: 'Q1001', wikiTitle: '丙酮', wikiRevid: 777, zhNameFrom: 'zh', converted: true }, '2026-10-19');
  assert(t.startsWith('物質：丙酮 / Acetone')); assert(t.includes('Wikidata Q1001｜維基百科 「丙酮」'));
  assert(t.includes('oldid=777')); assert(t.includes('CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/')); assert(t.includes('授權 CC0')); assert(t.includes('台灣用語'));
  assert(renderCard({ ...base, wikiError: true }, 'd').includes('暫時無法連線'));
  assert(renderCard({ ...base }, 'd').includes('未找到對應條目'));
});
