# Tsukuyomi Skill 檔案結構與資料規格 (File Specification)

Tsukuyomi Translator Skill 採用「一章一檔 + 輕量 YAML」的極簡檔案架構，徹底解決巨型 JSON 對 LLM 造成的上下文污染，同時透過 `tsukuyomi-bridge.ts` 提供隨時打包回 Tsukuyomi 網頁版的能力。

---

## 一、目錄結構 (Directory Structure)

每部小說均存放於獨立資料夾中（預設位於 `novels/<小說名稱>/`）：

```text
novels/<novel-folder>/
├── meta.yaml               # 書籍與章節目錄元資料
├── characters.yaml         # 角色庫 (姓名、性別、譯名、語氣、別名)
├── glossary.yaml           # 術語庫 (專有名詞、技能、地名、譯名)
├── memories.yaml           # 翻譯與文風約定 (稱呼慣例、風格偏好；不存劇情)
├── raw/                    # 各章日文原文純文字 (1 章 1 檔)
│   ├── ch001_序章.txt
│   └── ch002_第一話.txt
└── translated/             # 各章日中雙欄對照 Markdown 表格 (1 章 1 檔)
    ├── ch001_序章.md
    └── ch002_第一話.md
```

---

## 二、YAML 檔案規格

### 1. `characters.yaml` (角色表)
供翻譯與潤色時對照，保證全書人名、對白口癖與語氣一致：

```yaml
- id: char-001
  name: 恭介
  translation: 恭介
  sex: male             # male | female | other | unknown
  speakingStyle: 略帶自信與輕浮，喜歡在電影話題上說教
  description: 30歲知名IT企業員工，紀子的戀人
  aliases:
    - 彼
    - あいつ

- id: char-002
  name: ロムレス
  translation: 羅穆路斯
  sex: female
  speakingStyle: ""
  description: 5歲母西伯利亞哈士奇
  aliases:
    - 犬
```

### 2. `glossary.yaml` (術語表)
專有名詞、技能名、地名、組織名等強制統一譯法：

```yaml
- id: term-001
  name: グラップラー刃牙
  translation: 刃牙
  category: 作品名      # 可選：地名 / 技能 / 物品 / 組織 / 魔法 等
  description: 著名格鬥漫畫名
```

### 3. `memories.yaml` (風格約定與記憶)
**核心限制：只記錄翻譯約束與風格偏好，嚴禁寫入劇情流水帳或世界觀大綱**：

```yaml
- id: mem-001
  summary: 敬語與稱呼約定
  content: 紀子對恭介說話使用平輩隨和口氣，恭介對外人偏客套，對紀子時常帶調侃語氣。
```

### 4. `meta.yaml` (書籍與章節目錄元資料)
維護小說的 ID、日文原名、中文譯名、作者、來源網址以及卷與章節結構：

```yaml
id: 7aabdecf-a41c-4193-b43c-edb69ee77cce
title:
  original: 犬は死なないホラー
  translation: 狗狗不會死的恐怖故事
author: ハナノネ
description: 小說簡介...
sourceUrl: https://kakuyomu.jp/works/...
tags:
  - 恐怖
  - 輕小說
coverUrl: ""
volumes:
  - id: vol-1
    title:
      original: 第一卷
      translation: 第一卷
    chapters:
      - id: chap-1
        filename: ch001_※注意※
        title:
          original: ※注意※
          translation: ※注意※
        webUrl: https://...
```

---

## 三、章節內容檔案規格

### 1. 原文文字檔 (`raw/<filename>.txt`)
- 純文字檔案，每行代表一個日文段落（與 Tsukuyomi 段落 1:1 對齊）。
- 空行在抓取時已被過濾，確保無多餘空白段落。

### 2. 雙欄對照 Markdown 表格 (`translated/<filename>.md`)
- 標題格式：`# <日文原名> / <繁中譯名>`
- 表頭格式：
  ```markdown
  | 日文原文 | 繁體中文譯文 |
  | :--- | :--- |
  | 原文第一段 | 譯文第一段 |
  | 原文第二段 | 譯文第二段 |
  ```
- **管道符 `|`** 必須轉義為 `\|`。
- **段落內換行** 必須轉換為 `<br>`。

---

## 四、與 Tsukuyomi 網頁版雙向轉換 (Bridge)

透過 `scripts/tsukuyomi-bridge.ts` 實現隨時雙向互轉：

* **解包 (Unpack)**：
  ```bash
  bun .opencode/skills/tsukuyomi-translator/scripts/tsukuyomi-bridge.ts unpack <novel.json> [output-dir]
  ```
* **打包 (Pack)**：
  ```bash
  bun .opencode/skills/tsukuyomi-translator/scripts/tsukuyomi-bridge.ts pack <novel-dir> [output.json]
  ```
  打包時自動為段落生成 Tsukuyomi 規格之 ID、`selectedTranslationId` 與 `translations` 物件，輸出之 JSON 可 100% 相容拖入 Tsukuyomi 網頁版閱讀與備份。
