import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validCas } from '../../js/input/cas.js';
import { parseFormula, hill } from '../../js/input/formula.js';
import { ELEMENTS } from '../../js/input/elements.js';
import { normalize } from '../../js/input/normalize.js';
import { classify } from '../../js/input/classify.js';
import { parseTemp, parseDensity } from '../../js/parse/value.js';
import { compare } from '../../js/compare/compare.js';
import { parseGhs } from '../../js/parse/ghs.js';
import { createQueue } from '../../js/net/queue.js';
import { renderCard, DISCLAIMER } from '../../js/render/card.js';
const rules = JSON.parse(readFileSync(new URL('../../data/out-of-scope.json', import.meta.url)));
const H = s => hill(parseFormula(s, ELEMENTS));
test('CAS 檢查碼', () => { assert(validCas('67-64-1')); assert(validCas('64-17-5')); assert(!validCas('67-64-2')); assert(!validCas('abc')); });
test('化學式與 Hill', () => {
  assert.equal(H('CH3COCH3'), 'C3H6O'); assert.equal(H('CuSO4·5H2O'), 'CuH10O9S');
  assert.equal(H('H2O'), 'H2O'); assert.notDeepEqual(parseFormula('CO', ELEMENTS), parseFormula('Co', ELEMENTS));
  assert.equal(parseFormula('co', ELEMENTS), null); assert.equal(parseFormula('Acetone', ELEMENTS), null);
});
test('正規化與分類', () => {
  assert.equal(normalize('CuSO4.5H2O'), 'CuSO4·5H2O'); assert.equal(normalize(' H₂O '), 'H2O');
  assert.equal(classify('鹽酸', rules, ELEMENTS).type, 'oos'); assert.equal(classify('75% 酒精', rules, ELEMENTS).type, 'oos');
  assert.equal(classify('67-64-2', rules, ELEMENTS).type, 'badcas'); assert.equal(classify('丙酮', rules, ELEMENTS).type, 'cjk');
  assert.equal(classify('acetone', rules, ELEMENTS).type, 'name'); assert.equal(classify('NaCl', rules, ELEMENTS).alsoName, true);
});
test('數值解析', () => {
  assert.equal(parseTemp('133 °F at 760 mmHg').value.toFixed(1), '56.1'); assert.equal(parseTemp('133 °F at 760 mmHg').pressure, 760);
  assert.equal(parseTemp('-95 to -94 °C').value, -94.5); assert.equal(parseTemp('Decomposes at 200 °C').kind, 'decomp');
  assert.equal(parseTemp('sublimes').kind, 'subl'); assert.equal(parseTemp('very hot').kind, 'unparsed');
  assert.deepEqual(parseDensity('0.7899 g/cm³ at 20 °C'), { raw: '0.7899 g/cm³ at 20 °C', kind: 'num', value: 0.7899, temp: 20 });
  assert.equal(parseDensity('790 kg/m3 at 20 °C').value, 0.79);
});
const n = (v, s, p) => ({ raw: String(v), kind: 'num', value: v, pressure: p, source: s });
test('狀態判定', () => {
  assert.equal(compare('mp', []).status, '查無');
  assert.equal(compare('mp', [n(56, 'A')]).status, '單一來源');
  assert.equal(compare('mp', [n(56, 'A'), n(56, 'A')]).status, '單一來源'); // 同來源重複不算兩個
  assert.equal(compare('mp', [n(56, 'A'), n(57, 'B')]).status, '一致');
  assert.equal(compare('mp', [n(56, 'A'), n(60, 'B')]).status, '衝突');
  const c = compare('mp', [n(56, 'A'), { raw: 'decomposes', kind: 'decomp', source: 'B' }]);
  assert.equal(c.status, '衝突'); assert.equal(c.shown, null);
  assert.equal(compare('bp', [n(56, 'A', 760), n(80, 'B', 100)]).status, '單一來源'); // 非常壓排除
});
test('GHS 代碼擷取', () => {
  const g = parseGhs([{ name: 'Signal', text: 'Danger', source: 'X' }, { name: 'H', text: 'H225 (100%): Highly Flammable liquid and vapor [Danger]', source: 'X' },
    { name: 'H', text: 'H360Df+H361 (5%): x', source: 'X' }, { name: 'H', text: 'H225 (3%): dup', source: 'Y' }]);
  assert.equal(g.signalZh, '危險'); assert.equal(g.codes.length, 2); assert.equal(g.codes[0].pct, '100'); assert.equal(g.codes[1].code, 'H360Df+H361');
  assert.equal(g.codes[0].zh, null); // 無官方詞表 → 不得自行翻譯
});
test('佇列：429 退避後成功', async () => {
  let k = 0; const waits = [];
  const q = createQueue({ minGapMs: 0, maxConcurrent: 2, timeoutMs: 1000, retries: 3, sleep: async ms => waits.push(ms),
    fetchImpl: async () => (++k < 3 ? { status: 429, ok: false } : { status: 200, ok: true, json: async () => ({ ok: 1 }) }) });
  assert.deepEqual(await q.request('u'), { ok: 1 }); assert.equal(k, 3);
});
test('佇列：持續 503 → BUSY', async () => {
  const q = createQueue({ minGapMs: 0, maxConcurrent: 1, timeoutMs: 1000, retries: 2, sleep: async () => {}, fetchImpl: async () => ({ status: 503, ok: false }) });
  await assert.rejects(q.request('u'), /BUSY/);
});
test('資料卡固定句與來源區塊', () => {
  const empty = { status: '查無', sources: [], use: [], other: [], shown: null };
  const txt = renderCard({ cid: 180, enName: 'Acetone', zhName: null, cas: '67-64-1', formula: 'C3H6O', mw: '58.08', fields: { mp: empty, bp: empty, density: empty }, text: { solubility: [], appearance: [] }, ghs: { codes: [], signal: null } }, '2026-10-19');
  assert(txt.includes(DISCLAIMER)); assert.equal(DISCLAIMER, '供學習參考,實際操作以正式 SDS 為準。');
  assert(txt.includes('https://pubchem.ncbi.nlm.nih.gov/compound/180')); assert(txt.includes('NIST WebBook'));
});
test('原始碼不含禁用儲存 API', () => {
  for (const f of ['main.js', 'net/cache.js', 'net/queue.js']) assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8')));
});
test('密度：PubChem 的 g/cu cm 可解析；無單位的相對密度一律排除', () => {
  const a = parseDensity('0.7845 g/cu cm at 20 °C');
  assert.equal(a.kind, 'num'); assert.equal(a.value, 0.7845); assert.equal(a.temp, 20);
  assert.equal(parseDensity('0.7845 g/cu.cm at 68 °F').temp, 20);
  assert.equal(parseDensity('790 kg/cu m at 20 °C').value, 0.79);
  assert.equal(parseDensity('0.79 g/mL at 20 °C').value, 0.79);
  for (const s of ['0.791', '0.79', 'Specific gravity: 0.7899 at 20 °C/4 °C', 'Relative density (water = 1): 0.79']) {
    const r = parseDensity(s); assert.equal(r.kind, 'unparsed', s); assert.match(r.why, /相對密度/);
  }
  assert.equal(parseDensity('100 mg/mL').kind, 'unparsed'); // 不可把 mg/mL 當成 g/mL
  assert.equal(parseDensity('colorless liquid').why, '無法解析');
});
test('密度比對：g/cu cm 兩來源一致；相對密度列入其他條件並顯示原因', () => {
  const e = (raw, source) => ({ ...parseDensity(raw), source });
  const c = compare('density', [e('0.7845 g/cu cm at 20 °C', 'HSDB'), e('0.7899 g/cm³ at 20 °C', 'CRC'), e('0.791', 'ICSC')]);
  assert.equal(c.status, '一致'); assert.deepEqual(c.sources, ['HSDB', 'CRC']);
  assert.equal(c.other.length, 1); assert.match(c.other[0].why, /相對密度/);
});
test('GHS：同一代碼優先取有比例的那一筆', () => {
  const it = (text, source) => ({ name: 'H', text, source });
  const g = parseGhs([it('H225: Highly flammable liquid and vapour', 'NoPct'), it('H319 (95.2%): Causes serious eye irritation', 'A'),
    it('H225 (100%): Highly Flammable liquid and vapor [Danger Flammable liquids]', 'WithPct'), it('H319 (3%): dup', 'B'), it('H336: x', 'C')]);
  assert.deepEqual(g.codes.map(c => c.code), ['H225', 'H319', 'H336']); // 順序仍依首次出現
  assert.equal(g.codes[0].pct, '100'); assert.equal(g.codes[0].source, 'WithPct'); assert.equal(g.codes[0].en, 'Highly Flammable liquid and vapor');
  assert.equal(g.codes[1].pct, '95.2'); assert.equal(g.codes[1].source, 'A'); // 兩筆都有比例 → 留第一筆
  assert.equal(g.codes[2].pct, null); // 全都沒有比例 → 照樣顯示，不隱藏
});
