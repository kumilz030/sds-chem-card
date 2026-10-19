# DECISIONS

## 2026-10-19 建置環境無法連到 PubChem／維基（M0 未完成）
- 問題：產生此專案的環境網路白名單不含 pubchem.ncbi.nlm.nih.gov，無法實測端點、CORS、報告大小，也無法錄製 fixture。
- 決定：`js/sources/pubchem.js` 依 PUG REST／PUG View 的已知結構寫成，欄位走訪採 TOCHeading 比對；**所有解析尚未用真實回應驗證**。請在有網路的機器先跑 `node scripts/serve.mjs`、`?debug=1` 查看請求紀錄，並錄製 fixture 後補測。
- 理由：規格要求不得編造資料，也不得手寫 fixture。

## 2026-10-19 H 代碼正規式
- 規格的 `H[0-9]{3}[A-Za-z]?` 只吃一個字母，會把 H360Df 截成 H360D（錯誤代碼）。改為 `{0,2}`。

## 2026-10-19 其他
- 元素表放在 `js/input/elements.js`（Set），不用 `data/elements.json`，避免瀏覽器與 Node 載入方式不同。
- `out-of-scope.json` 加入簡體寫法（盐酸、双氧水、福尔马林）。
- PubChem 回 400 或 404 一律視為查無；403／5xx／429 才重試。
- 密度比較：以第一筆有溫度的值為基準，溫度差 > 5 °C 者列入「其他條件」。
- GHS：同一代碼只出現一次（見 2026-10-19「H 代碼比例」）。詞表 `ghs-h-zh-tw.json` 為空，所以目前所有 H 代碼皆顯示英文並註明無官方中文對照。
- 候選清單取 PubChem 回傳的前 10 個 CID；化學式（如 C3H6O）的異構物多時，目標物質不一定在前 10 筆。

## 2026-10-19 密度：支援 g/cu cm，無單位值仍排除
- 問題：PubChem（HSDB 等）把單位寫成 `g/cu cm`（例 `0.7845 g/cu cm at 20 °C`），原本的解析式只認 `g/cm³`、`g/mL`、`g/cc`、`kg/m³`，所以密度全部解析失敗。
- 決定：`parse/value.js` 增加 `g/cu cm`、`g/cu.cm`、`kg/cu m`。沒有單位的數字（`0.791`、`0.79`、`Specific gravity: 0.7899 at 20 °C/4 °C`）是相對密度，不是 g/cm³，**仍排除**，列在「其他條件」並註明「無密度單位（可能是相對密度）」。`100 mg/mL` 不會被誤當成 g/mL。
- 未處理：`0.78-0.79 g/cm³` 這類範圍目前只取最後一個數字（原本就如此），待真實回應確認有無這種寫法再處理。

## 2026-10-19 H 代碼比例
- 問題：同一代碼有多筆時只取第一筆，常取到沒附通報比例的來源，資料卡就沒有比例。
- 決定：同一代碼優先取「有比例」的那一筆；多筆都有比例時取第一筆；都沒有比例才取第一筆（仍顯示，不隱藏）。代碼順序依首次出現。

## 2026-10-19 維基百科模組（中文名稱）— 尚未用真實回應驗證
- 範圍：只做中文名稱。熔點、沸點等維基化學框物性**未做**（卡片仍只用 PubChem 物性）。
- 中文輸入：`opencc-js`（cn → twp）轉台灣用語，放在 `vendor/opencc-js/cn2t.js`（MIT；授權檔一併放入），遇到第一個中文查詢才動態載入（約 1 MB）。先用「原樣＋轉換後」兩種寫法精確比對維基條目標題（含重新導向），找不到才退回搜尋。
- 判定是不是化學物質：Wikidata 條目必須有 P662（PubChem CID）、P231（CAS）、P246（元素符號）其中之一；消歧義頁排除。
- CID 來源：優先 P662；沒有就用 P231 的 CAS 經 PubChem 同義詞核對（核對不到就丟棄）；元素（無 CID、無 CAS）才用英文標籤查 PubChem，且 PubChem 標題必須與標籤相同才收。全都不靠猜。
- fuzzy：經重新導向（如「酒精」→「乙醇」）或搜尋得到的候選一律標 fuzzy，即使只有一筆也要使用者確認。
- 資料卡中文名：英文名、CAS、化學式查到的物質，另以 `haswbstatement:P662=<CID>` 向 Wikidata 查中文名；CID 對不上就丟棄。標籤優先序 zh-tw → zh-hant → zh → zh-hans → zh-cn → 維基條目標題，除 zh-tw／zh-hant 外一律再過 OpenCC。失敗只影響中文名，卡片照出並標示「暫時無法連線」。
- 署名：卡片來源區塊列 Wikidata（QID、CC0）與維基條目（標題、`oldid` 連結、CC BY-SA 4.0 與連結），名稱經轉換時註明「屬整理後內容」。
- **驗證狀態**：本環境連不到 zh.wikipedia.org／wikidata.org／pubchem（403），所以以下都是依 API 文件寫的、未實測：`formatversion=2` 的回應形狀、`prop=pageprops|revisions` 與 `redirects`／`converttitles`／`variant=zh-tw` 的組合、`generator=search` 的 `index` 欄位、`haswbstatement:P662=…` 搜尋語法、CORS（`origin=*`）。`test/unit/wiki.test.mjs` 的回應是手寫的模擬資料，只測我們自己的邏輯，不是 fixture。請在有網路的機器開 `?debug=1` 實測並錄製 fixture。
- 另做過一次瀏覽器冒煙測試（Playwright 攔截三個網域，回模擬資料）：中文與英文兩條路都能出卡片，維基署名、密度與 H 代碼比例都如預期。
