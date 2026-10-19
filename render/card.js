export const DISCLAIMER = '供學習參考,實際操作以正式 SDS 為準。';
const LINKS = [['NIST WebBook', 'https://webbook.nist.gov/chemistry/'], ['ECHA', 'https://echa.europa.eu/information-on-chemicals'], ['GESTIS', 'https://gestis.dguv.de/']];
const FIELDS = [['mp', '熔點'], ['bp', '沸點'], ['density', '密度']];
const fmt = (f, e) => {
  if (e.kind === 'decomp') return '分解'; if (e.kind === 'subl') return '昇華';
  if (f === 'density') return `${e.value.toPrecision(3)} g/cm³` + (e.temp != null ? `(${Math.round(e.temp)} °C)` : '');
  return `${Math.round(e.value)} °C` + (f === 'bp' && e.pressure != null ? '(1 atm)' : '');
};
const manual = () => `手動查詢：${LINKS.map(([n, u]) => `${n} ${u}`).join('；')}`;
// d: {cid,enName,zhName,cas,formula,mw, fields:{mp,bp,density}(compare 結果), text:{solubility,appearance}[], ghs}
export function renderCard(d, date) {
  const L = [];
  L.push(`物質：${d.zhName ? d.zhName + ' / ' : ''}${d.enName}    CAS：${d.cas ?? '查無'}`);
  const miss = d.wikiError ? '暫時無法連線' : '查無';
  L.push(`識別碼：PubChem CID ${d.cid}｜Wikidata ${d.qid ?? miss}｜維基百科 ${d.wikiTitle ? `「${d.wikiTitle}」` : miss}`, `資料擷取日期：${date}`, '');
  L.push('【化學式與分子量】', `值：${d.formula ?? '查無'}${d.mw ? '　' + d.mw + ' g/mol' : ''}`, '來源：PubChem', '');
  for (const [k, label] of FIELDS) {
    const r = d.fields[k]; L.push(`【${label}】`);
    if (r.status === '查無') L.push('值：查無', '已查來源：PubChem', manual());
    else {
      L.push(`值：${r.shown ? fmt(k, r.shown) : '見各來源原始值'}`, `資訊狀態：${r.status}（${r.sources.join('、')}）`);
      L.push('各來源原始值：' + r.use.map(e => `${e.source}「${e.raw}」`).join('；'));
    }
    if (r.other.length) L.push('其他條件：' + r.other.map(e => `${e.source}「${e.raw}」（${e.why}）`).join('；'));
    L.push('');
  }
  for (const [k, label] of [['solubility', '溶解度'], ['appearance', '外觀']]) {
    L.push(`【${label}】`);
    if (!d.text[k].length) L.push('值：查無', '已查來源：PubChem', manual());
    else L.push('值：見各來源原文', ...d.text[k].map(e => `  PubChem/${e.source}「${e.text}」（英文原文）`));
    L.push('');
  }
  L.push('【毒性危害】');
  if (!d.ghs.codes.length && !d.ghs.signal) L.push('值：查無', '已查來源：PubChem', manual());
  else {
    L.push(`值：訊號詞：${d.ghs.signalZh ?? '查無'}`);
    for (const c of d.ghs.codes) L.push(`  ${c.code} ${c.zh ?? c.en + '（無官方中文對照）'}${c.pct ? `（${c.pct}%）` : ''}`);
    L.push('來源：PubChem（原始出處：' + [...new Set(d.ghs.codes.map(c => c.source))].join('、') + '）');
  }
  L.push('', DISCLAIMER, '', '── 來源與授權 ──');
  L.push(`PubChem：https://pubchem.ncbi.nlm.nih.gov/compound/${d.cid}　物質編號 CID ${d.cid}　擷取日期 ${date}`);
  if (!d.qid && !d.wikiTitle) L.push(d.wikiError ? '維基百科／Wikidata：暫時無法連線，中文名稱未取得。' : '維基百科／Wikidata：未找到對應條目，中文名稱查無。');
  else {
    const from = d.zhNameFrom === 'zhwiki-title' ? '維基百科中文版條目標題' : d.zhNameFrom ? `Wikidata 標籤（${d.zhNameFrom}）` : null;
    if (d.qid) L.push(`Wikidata：https://www.wikidata.org/wiki/${d.qid}　識別碼 ${d.qid}　授權 CC0　擷取日期 ${date}`);
    if (d.wikiTitle) {
      const t = encodeURIComponent(d.wikiTitle);
      const url = d.wikiRevid ? `https://zh.wikipedia.org/w/index.php?title=${t}&oldid=${d.wikiRevid}` : `https://zh.wikipedia.org/wiki/${t}`;
      L.push(`維基百科中文版「${d.wikiTitle}」：${url}　授權 CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/　擷取日期 ${date}`);
    }
    if (from) L.push(`中文名稱來源：${from}${d.converted ? '；已轉為台灣用語（OpenCC），屬整理後內容' : ''}`);
  }
  return L.join('\n');
}
