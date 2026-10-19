export const CONFIG = {
  pubchem: 'https://pubchem.ncbi.nlm.nih.gov/rest',
  minGapMs: 250, maxConcurrent: 2, timeoutMs: 30000, retries: 3,
  tol: { mp: 2, bp: 2, density: 0.02 }, densityTempWindow: 5,
  // 維基百科中文版／Wikidata：同時 1 個請求（規格 §6.1）。
  wiki: { zhApi: 'https://zh.wikipedia.org/w/api.php', wdApi: 'https://www.wikidata.org/w/api.php', minGapMs: 100, maxConcurrent: 1 },
};
