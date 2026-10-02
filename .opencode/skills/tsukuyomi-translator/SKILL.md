---
name: tsukuyomi-translator
description: AI-driven Japanese light novel translation, scraping, polishing, proofreading, character/terminology management, and bilingual table export in Traditional Chinese (繁體中文). Use when the user requests downloading, managing, translating, polishing, or organizing light novels, chapters, terminology, character settings, or exporting to Tsukuyomi web format.
license: Apache-2.0
compatibility: OpenCode environment with Bun installed
metadata:
  author: tsukuyomi
  version: "2.0"
---

# Tsukuyomi Translator — OpenCode Agent Skill

本 Skill 賦予 OpenCode Agent 完整的日文輕小說翻譯、章節抓取、語氣潤色、名詞一致性管理與雙向網頁版相容能力，輸出預設 100% 為**繁體中文 (台灣)**。

採用**「逐章純文字 + 簡潔 YAML 知識庫 + 雙向轉換橋接器」**架構，徹底解決巨型 JSON 帶來的 Token 浪費與上下文干擾，同時保證成果可隨時一鍵打包匯入 Tsukuyomi 網頁版。

---

## 📁 小說目錄架構

每部小說均存放在獨立資料夾（預設 `novels/<小說名稱>/`）：

```text
novels/<novel-name>/
├── meta.yaml               # 小說資訊、卷與章節目錄
├── characters.yaml         # 角色設定表 (姓名、性別、口癖、別名、譯名)
├── glossary.yaml           # 術語庫 (專有名詞、技能、地名、譯名)
├── memories.yaml           # 文風與翻譯約定 (嚴禁存劇情流水帳)
├── raw/                    # 各章日文原文純文字 (1 章 1 檔)
│   └── ch001_序章.txt
└── translated/             # 各章日中雙欄對照 Markdown (1 章 1 檔)
    └── ch001_序章.md
```

---

## 🛠️ 核心指令與輔助工具

1. **抓取小說 (Scrape)**:
   ```bash
   bun .opencode/skills/tsukuyomi-translator/scripts/scrape.ts "<小說網址>" [novels/<目錄名>] [--limit N]
   ```
   支援 `kakuyomu.jp`、`ncode.syosetu.com`、`novel18.syosetu.com`、`syosetu.org`。

2. **解包 Tsukuyomi 網頁版 JSON (Unpack)**:
   ```bash
   bun .opencode/skills/tsukuyomi-translator/scripts/tsukuyomi-bridge.ts unpack <novel.json> [novels/<目錄名>]
   ```

3. **打包回 Tsukuyomi 網頁版 JSON (Pack)**:
   ```bash
   bun .opencode/skills/tsukuyomi-translator/scripts/tsukuyomi-bridge.ts pack novels/<小說目錄> [output.json]
   ```
   產出之 JSON 可直接在 Tsukuyomi 網頁版 / 桌面版匯入瀏覽。

---

## 📖 Agent 作業標準流程 (SOP)

### 步驟 1：建立或載入小說
- 若使用者提供**小說網址**：執行 `scrape.ts` 下載目錄與原文。
- 若使用者提供**網頁版備份 JSON**：執行 `tsukuyomi-bridge.ts unpack` 解包。
- 檢查 `novels/<小說名稱>/meta.yaml` 確認章節清單。

### 步驟 2：維護角色與術語庫
翻譯前或翻譯過程中，讀取並維護小說目錄下的 YAML 檔案：
- **`characters.yaml`**：記錄登場角色、口癖、語氣、主要譯名與別名。
- **`glossary.yaml`**：記錄作品獨特的專有名詞、技能名、地名、道具名。
- **`memories.yaml`**：僅記錄文風偏好與特殊翻譯約束（**嚴禁寫入劇情內容**）。

### 步驟 3：逐章翻譯 (Translate)
當使用者要求翻譯指定章節（例如「翻譯第 2 章」）：
1. 讀取 `novels/<小說名稱>/characters.yaml` 與 `glossary.yaml`。
2. 讀取 `novels/<小說名稱>/raw/chXXX_*.txt`。
3. 遵循 `.opencode/skills/tsukuyomi-translator/references/PROMPTS_GUIDE.md` 規範：
   - **1:1 段落嚴格對應**：禁止擅自合併或拆分。
   - **標點全形化**：使用中文全形標點（`，。？！：；「」『』（）——……`），英數半形。
   - **日文中黑點保留**：原文中的「・」必須原樣保留，禁止改為「……」。
   - **引號嚴格成對**：原文有「」『』"" 時，譯文必須對齊成對引號。
   - **敬語處理鐵律**：別名優先，章節內嚴格一致，嚴禁將敬語加入別名。
   - **完整翻譯**：絕不遺留假名或未翻譯片假名。
4. 將結果直接寫入 `novels/<小說名稱>/translated/chXXX_*.md`：
   ```markdown
   # 日文原標題 / 繁中譯名

   | 日文原文 | 繁體中文譯文 |
   | :--- | :--- |
   | 原文第 1 段 | 譯文第 1 段 |
   | 原文第 2 段 | 譯文第 2 段 |
   ```
   （段落內如有 `|` 需轉義為 `\|`，段落內換行轉換為 `<br>`）。
5. 檢查此章是否有新出現的人名或術語，主動更新至 YAML。

### 步驟 4：潤色與校對 (Polish & Proofread)
當使用者要求「潤色」或「校對」：
1. 讀取對應的 `translated/chXXX_*.md`。
2. 消除翻譯腔，對白帶入角色 `speakingStyle`。
3. 逐行比對錯漏字與術語一致性，直接以 `edit` 或 `write` 修改該 Markdown 檔案。

### 步驟 5：匯入回 Tsukuyomi 網頁版
當使用者需要將翻譯成果匯入回 Tsukuyomi 網頁版閱讀：
執行 `bun .opencode/skills/tsukuyomi-translator/scripts/tsukuyomi-bridge.ts pack novels/<小說目錄> [output.json]`，產出之 JSON 即可在網頁版無縫匯入。

---

## 📚 參考規範手冊

- 提示詞與翻譯風格鐵律：`.opencode/skills/tsukuyomi-translator/references/PROMPTS_GUIDE.md`
- 詳細檔案規格說明：`.opencode/skills/tsukuyomi-translator/references/FILE_SPEC.md`
