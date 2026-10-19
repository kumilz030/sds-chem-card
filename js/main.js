import { CONFIG } from './config.js';
import { ELEMENTS } from './input/elements.js';
import { validCas } from './input/cas.js';
import { createQueue } from './net/queue.js';
import { createCache } from './net/cache.js';
import { createPubchem, extract } from './sources/pubchem.js';
import { createWikimedia } from './sources/wikimedia.js';
import { resolve, MSG } from './resolve/resolve.js';
import { parseTemp, parseDensity } from './parse/value.js';
import { parseGhs } from './parse/ghs.js';
import { compare } from './compare/compare.js';
import { renderCard } from './render/card.js';

const $ = id => document.getElementById(id);
const debug = new URLSearchParams(location.search).has('debug');
const log = [], q = createQueue(CONFIG), cache = createCache();
const qw = createQueue({ ...CONFIG, minGapMs: CONFIG.wiki.minGapMs, maxConcurrent: CONFIG.wiki.maxConcurrent });
let ctl = null;
const get = url => cache.get(url, async () => { const r = await q.request(url, ctl?.signal); log.push({ url, ok: r !== null, raw: r }); return r; });
// 維基失敗要和 PubChem 失敗分開（規格 §6.5）：取消照常往上丟，其餘一律標成 WIKI_*。
const getW = url => cache.get(url, async () => {
  try { const r = await qw.request(url, ctl?.signal); log.push({ url, ok: r !== null, raw: r }); return r; }
  catch (x) { throw ctl?.signal.aborted ? x : new Error('WIKI_BUSY'); }
});
// opencc-js 約 1 MB，第一次遇到中文才載入。cn → twp：簡體轉台灣繁體用語。
let tw = null;
const toTw = async s => { tw ??= (await import('../vendor/opencc-js/cn2t.js')).Converter({ from: 'cn', to: 'twp' }); return tw(s); };
const pc = createPubchem(get), wiki = createWikimedia({ get: getW, toTw });
const [rules, ghsTable] = await Promise.all(['data/out-of-scope.json', 'data/ghs-h-zh-tw.json'].map(u => fetch(u).then(r => r.json())));

const setMsg = t => { $('msg').textContent = t; };
const busy = on => { $('go').disabled = on; $('cancel').hidden = !on; };

async function build(c) {
  const rep = await pc.report(c.cid);
  const src = (h, fn) => extract(rep, h).map(i => ({ ...fn(i.text), source: 'PubChem/' + i.source }));
  const text = h => extract(rep, h).map(i => ({ text: i.text, source: i.source }));
  const cas = c.cas ?? (await pc.synonyms(c.cid)).find(validCas) ?? null;
  // 英文名／CAS／化學式查到的物質，另向 Wikidata 補台灣用語中文名；失敗不影響其餘欄位。
  let w = null, wikiError = false;
  if (!c.qid) try { w = await wiki.byCid(c.cid, cas); } catch (x) { if (ctl?.signal.aborted) throw x; wikiError = true; }
  return {
    ...c, cas, wikiError,
    ...(w && { zhName: w.zhName, qid: w.qid, wikiTitle: w.title, wikiRevid: w.revid, zhNameFrom: w.zhNameFrom, converted: w.converted }),
    fields: { mp: compare('mp', src('Melting Point', parseTemp)), bp: compare('bp', src('Boiling Point', parseTemp)), density: compare('density', src('Density', parseDensity)) },
    text: { solubility: text('Solubility'), appearance: [...text('Physical Description'), ...text('Color/Form')] },
    ghs: parseGhs(extract(rep, 'GHS Classification'), ghsTable),
  };
}
async function show(c) {
  setMsg('正在整理資料卡…'); $('cands').replaceChildren();
  const d = await build(c);
  $('card').textContent = renderCard(d, new Date().toISOString().slice(0, 10));
  $('out').hidden = false; setMsg('');
}
async function run(e) {
  e.preventDefault(); ctl = new AbortController(); busy(true); $('out').hidden = true; $('cands').replaceChildren(); setMsg('查詢中…');
  try {
    const r = await resolve($('q').value, { pc, rules, elements: ELEMENTS, wiki });
    if (r.kind === 'msg') setMsg(r.msg + (r.note ? '\n' + r.note : ''));
    else if (r.kind === 'one') await show(r.cand);
    else {
      setMsg(r.msg);
      for (const c of r.cands) {
        const b = document.createElement('button'); b.type = 'button';
        b.textContent = `${c.zhName ? c.zhName + ' / ' : ''}${c.enName}　${c.formula ?? ''}　CID ${c.cid}`;
        b.onclick = async () => { ctl = new AbortController(); busy(true); try { await show(c); } catch (x) { fail(x); } busy(false); };
        $('cands').append(b);
      }
    }
  } catch (x) { fail(x); }
  busy(false);
  if (debug) { $('dbg').hidden = false; $('dbgbody').textContent = `請求數 ${q.count + qw.count}（PubChem ${q.count}／維基 ${qw.count}）\n` + log.map(l => `${l.ok ? 'OK ' : '404'} ${l.url}`).join('\n'); }
}
function fail(x) { setMsg(ctl?.signal.aborted ? '已取消' : x.message === 'BUSY' ? MSG.busy : '發生錯誤：' + x.message); }
$('f').addEventListener('submit', run);
$('cancel').onclick = () => ctl?.abort();
$('copy').onclick = async () => { await navigator.clipboard.writeText($('card').textContent); $('copy').textContent = '已複製'; setTimeout(() => ($('copy').textContent = '複製'), 1500); };
