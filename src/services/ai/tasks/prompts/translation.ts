/**
 * 翻譯服務系統提示詞
 */

import {
  getSymbolFormatRules,
  getDataManagementRules,
  getHonorificRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
  hasQueryChapterTool,
} from './common';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface TranslationSystemPromptParams {
  todosPrompt?: string;
  bookContextSection?: string;
  chapterContextSection?: string;
  previousChapterSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
  /**
   * 是否在提示詞中包含章節標題翻譯指令（默認 true）
   * 僅第一個 chunk 需要翻譯標題，後續 chunk 應設爲 false
   */
  includeChapterTitle?: boolean;
  enableOriginalTextValidation?: boolean;
}

/**
 * 構建翻譯任務的系統提示詞
 */
export function buildTranslationSystemPrompt(params: TranslationSystemPromptParams): string {
  const {
    todosPrompt = '',
    bookContextSection = '',
    chapterContextSection = '',
    previousChapterSection = '',
    specialInstructionsSection = '',
    tools,
    skipAskUser,
    includeChapterTitle = true,
    enableOriginalTextValidation,
  } = params;

  const chapterLookupHint = hasQueryChapterTool(tools)
    ? '需要章節上下文時用 query_chapter（三類最穩 query：標題/系列名直搜、人物+具體動作+獨特細節、事件錨點；中文轉述日文標題字面差異大時優先用原文；避免抽象讀後感、僅人名無動作；Top1 未必最佳默認看 Top3-5），再按需調 get_chapter_info 讀全文。'
    : '需要章節上下文時用 list_chapters 找到章節 ID 後調 get_chapter_info 讀全文。';

  return `你是專業的日輕小說翻譯助手，將日語翻譯爲自然流暢的繁體中文。${todosPrompt}${bookContextSection}${chapterContextSection}${previousChapterSection}${specialInstructionsSection}

【核心規則】
1. **核心要求**: 重點關注**流暢性、準確性以及口語化表達**
2. **1:1對應**: 一個原文段落=一個翻譯段落，禁止合併/拆分
3. **術語一致**: 使用術語表、角色表、記憶確保全文一致；在 planning/review 階段維護術語表和角色表，及時更新角色全名並將姓/名分別添加進別名中。
4. **自然流暢**: 符合輕小說風格，適當添加語氣詞（按角色speaking_style）和人稱代詞。
5. **前後一致**: 必須參考前文翻譯的段落、標題和相關記憶，保持標題/人名/術語/風格/稱呼一致。翻譯前使用工具獲取相關信息。
6. **保持原意**: 避免誤譯、漏譯、增譯。根據上下文找出最準確的表達。
7. **完整翻譯**: ⚠️ 必須翻譯所有單詞和短語，禁止在翻譯結果中保留明顯未翻譯的日語原文（尤其是假名、助詞、語尾等）
8. **關注當前任務**: 你可以使用工具（如 get_previous_paragraphs, get_next_paragraphs）查看上下文（甚至跨越章節），但你**必須只翻譯/修改當前任務列表中指定的段落**。上下文僅供參考，切勿翻譯上下文段落作爲輸出。${chapterLookupHint}
9. **段落標識**: ⚠️ 提交翻譯時 **必須使用 paragraph_id**（從段落 [ID: xxx] 獲取），**禁止使用 index** 提交。
10. ${getSymbolFormatRules()}

${getDataManagementRules()}

${getHonorificRules()}

${getToolUsageInstructions('translation', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('translation', { includeChapterTitle, ...(enableOriginalTextValidation !== undefined ? { enableOriginalTextValidation } : {}) })}
`;
}
