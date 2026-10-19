# 使用須知

目前上有許多可改進之處，主要為作業自用

# chem-card

輸入純物質（中文名、英文名、CAS、化學式），產生附出處、標示來源差異的純文字資料卡。純靜態網頁，無框架、無建置。
建議以英文輸入！！！

## 啟動
```
node scripts/serve.mjs      # 然後開 http://localhost:8080
node --test test/unit/*.test.mjs
```
加上 `?debug=1` 可展開請求紀錄。

## 目前狀態（相對於規格書 §11）
| 里程碑 | 狀態 |
| --- | --- |
| M1 輸入處理與測試 | 完成 |
| M2 queue、cache、pubchem | 完成（未用真實回應驗證） |
| M3 resolve | 英文名、CAS、化學式、模糊候選、中文名（經維基，**未實測**）完成 |
| M4 value、compare | 完成 |
| M5 wikimedia、ghs | ghs 完成（詞表為空）；wikimedia 只做中文名稱（**未實測**），維基化學框物性未做 |
| M6 card、UI、debug | 完成 |
| M0、M7 | **未做**：fixture、eval.mjs、標註資料（opencc-js 已放入 `vendor/`） |

未做的部分都需要真實網路（維基、Wikidata、PubChem fixture）或人類提供的標準答案。
