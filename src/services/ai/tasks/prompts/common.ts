import type { AITool } from 'src/services/ai/types/ai-service';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
export { MAX_TRANSLATION_BATCH_SIZE };
import type { TaskType, TaskStatus } from '../utils/task-types';
import { getTaskStateWorkflowText } from '../utils/task-types';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

/**
 * 判斷本次請求是否提供了 `query_chapter` 工具。
 * 用於條件性拼接提示詞裏的"章節語義搜索"段落 —— 本地嵌入關閉 / 手機端時,
 * 工具集合裏不會出現 query_chapter,提示詞也就不該再教模型去用它。
 */
export function hasQueryChapterTool(tools?: AITool[]): boolean {
  return tools?.some((t) => t.function.name === 'query_chapter') ?? false;
}

/**
 * 工具範圍規則：嚴格限制 AI 只能調用本次請求提供的 tools
 */
export function getToolScopeRules(tools?: AITool[]): string {
  const toolNames = tools?.map((t) => t.function.name) ?? [];
  const toolList =
    toolNames.length > 0
      ? toolNames.map((n) => `- \`${n}\``).join('\n')
      : '- （本次未提供任何工具）';

  return `【工具範圍】⚠️ **只能使用本次會話提供的工具**
- ⛔ 禁止調用未在列表中的工具
- 工具未提供時：基於已有上下文繼續任務

【本次可用工具列表】
${toolList}`;
}

/**
 * 獲取全角符號格式規則（精簡版）
 */
export function getSymbolFormatRules(): string {
  return `**格式規則**: 使用全角中文標點（，。？！：；「」『』（）——……），數字英文保持半角

⚠️ **保持原始格式**:
- 段落換行、縮進、特殊符號（★ ☆ ♥ ○ ● 等）
- 數字格式和英文數字間空格
- ⚠️ **非常重要**！確保翻譯沒有缺少原文的引號，如「」、『』和 ""
- ⚠️ 原文中的中黑點「・」必須原樣保留（如「・・」「・・・」），**禁止**將其轉換爲省略號「……」或其他符號
- ⛔ 禁止添加/刪除符號或修改排版`;
}

/**
 * 獲取規劃階段描述
 */
function getPlanningStateDescription(taskLabel: string, isBriefPlanning?: boolean): string {
  if (isBriefPlanning) {
    return `**當前狀態：簡短規劃階段 (planning)**
已繼承前一部分的規劃上下文。如需補充信息可調用工具，本階段也可創建/更新術語、角色、記憶。
按待辦清單逐項確認，完成後 \`update_task_status({"status": "working"})\`。`;
  }

  return `**當前狀態：規劃階段 (planning)**
上下文中提供的術語/角色/記憶已爲最新，無需重新獲取。按待辦清單逐項確認，缺失時再調用工具補充。
- 本階段是唯一的輸出前數據維護窗口：可創建/更新術語、角色、記憶
- ⚠️ 當前階段禁止提交${taskLabel}結果
⚠️ 所有待辦標記 done 後才能切換：\`update_task_status({"status": "working"})\``;
}

function getWorkingStateDescription(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  let focusDesc = '';
  switch (taskType) {
    case 'translation':
      focusDesc = '1:1翻譯，敬語按流程處理';
      break;
    case 'polish':
      focusDesc = '語氣詞優化、擺脫翻譯腔、節奏調整';
      break;
    default:
      focusDesc = '文字（錯別字/標點/語法）、內容（一致性/邏輯）、格式檢查';
  }

  const onlyChangedNote = taskType === 'translation' ? '' : '（只返回有變化的段落）';
  const nextStatus = taskType === 'translation' ? 'review' : 'end';
  const nextStatusNote =
    taskType === 'translation' ? '' : '（⚠️ 注意：此任務沒有 review 階段，直接進入 end）';
  const dataWriteRestrictionNote =
    taskType === 'translation' ? '（請在 planning 或 review 階段處理）' : '（請在 planning 階段處理）';
  const dataWriteRestrictionLine = dataWriteRestrictionNote
    ? `- ⛔ 禁止創建/更新術語、角色、記憶${dataWriteRestrictionNote}\n`
    : '';

  return `**當前狀態：${taskLabel}中 (working)**
- 專注於${taskLabel}：${focusDesc}
${dataWriteRestrictionLine}- 使用 \`add_translation_batch\` 提交結果 ${onlyChangedNote}（**單次上限 ${MAX_TRANSLATION_BATCH_SIZE} 段**）
按待辦清單逐批完成，每批完成後標記 done。
⚠️ 所有待辦標記 done 後才能切換：\`update_task_status({"status": "${nextStatus}"})\`${nextStatusNote}`;
}

/**
 * 獲取複覈階段描述
 */
function getReviewStateDescription(_taskLabel: string): string {
  return `**當前狀態：複覈階段 (review)**
按待辦清單逐項檢查，發現問題可直接用 \`add_translation_batch\` 修正。
可創建/更新術語、角色、記憶。
⚠️ 所有待辦標記 done 後才能切換：\`update_task_status({"status": "end"})\``;
}

/**
 * 獲取結束階段描述
 */
function getEndStateDescription(hasNextChunk?: boolean): string {
  const nextChunkNote = hasNextChunk
    ? '當前塊已完成，系統將自動提供下一個塊。'
    : '所有內容已處理完畢，這是最後一個塊。';

  return `**當前狀態：完成 (end)**
${nextChunkNote}
⚠️ **注意**：任務已結束，你不應再調用任何工具或輸出內容，請直接結束本次會話。`;
}

/**
 * 獲取當前狀態信息（用於告知AI當前處於哪個階段）
 * @param taskType 任務類型
 * @param status 當前狀態
 * @param isBriefPlanning 是否爲簡短規劃階段（用於後續 chunk，已繼承前一個 chunk 的規劃上下文）
 * @param hasNextChunk 是否有下一個塊可用
 */
export function getCurrentStatusInfo(
  taskType: TaskType,
  status: TaskStatus,
  isBriefPlanning?: boolean,
  hasNextChunk?: boolean,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  switch (status) {
    // preparing 已併入 planning，舊持久化任務恢復到該狀態時複用同一段描述
    case 'planning':
    case 'preparing':
      return getPlanningStateDescription(taskLabel, isBriefPlanning);
    case 'working':
      return getWorkingStateDescription(taskType);
    case 'review':
      return getReviewStateDescription(taskLabel);
    case 'end':
      return getEndStateDescription(hasNextChunk);
    default:
      return '';
  }
}

/**
 * 獲取敬語處理規則（獨立模塊）
 * [警告] 核心規則：嚴禁將敬語添加爲別名
 */
export function getHonorificRules(): string {
  return `【敬語處理規則】
⛔ **核心禁止**: 嚴禁自動將敬語（如"田中さん"）添加爲角色別名（別名爆炸會破壞一致性，別名由用戶手動維護）

**常見敬語對照**（僅爲參考，最終按角色關係與歷史翻譯決定）:
- さん: 通用敬語 → "先生/小姐/同學"，或省略（如"田中さん" → "田中先生" / "田中"）
- くん: 男性非正式 → "君"，或省略
- ちゃん: 親近/年幼 → "~醬"，或親暱稱呼
- 様: 正式敬語 → "大人/閣下"
- 殿: 古風敬語 → "殿/閣下"
- 先輩/後輩: → "前輩/學長學姐" / "後輩/學弟學妹"

**處理流程**（嚴格按順序執行）:
1. **別名優先**: 若【相關角色參考】的 \`aliases\` 中存在完全匹配的帶敬語別名且有譯文，**必須直接使用**，不得重新翻譯
2. **檢查角色關係**: 查看角色描述中的關係字段，判斷親密度與場合
3. **搜索歷史翻譯**: 使用 \`find_paragraph_by_keywords\` 查找該角色+敬語組合的既有譯法，必須保持一致
4. **搜索記憶**: 若有相關敬語處理方式的記憶，遵循記憶約定
5. **按關係決定**: 上述均無結果時，根據關係與上下文判斷

**關係與策略對應**:
- 親密關係（妹妹/好友/青梅竹馬/戀人）: 可省略敬語或使用親密稱呼
- 正式關係（上司/老師/長輩/客戶）: 必須保留並翻譯爲對應中文敬語
- 同輩關係（同學/同事）: 根據場景與語氣判斷
- 初次見面/陌生人: 保留正式敬語
- 關係不明: 優先保留敬語，結合上下文判斷，並與歷史翻譯保持一致

⚠️ **一致性鐵律**:
- **章節內必須一致**: 同一章內同一角色的同一稱呼**必須**翻譯完全相同，禁止出現混用（例如同章內既翻成"田中先生"又翻成"田中"）
- **跨章節保持一致**: 同一角色同一稱呼在全文中應始終翻譯一致，若發現不一致應以最早出現或用戶已確認的譯法爲準
- **敬語自檢**: 掃描本批次內同一角色的所有敬語譯法是否統一；必要時使用 \`find_paragraph_by_keywords\` 在當前章節內校驗`;
}

/**
 * 獲取數據管理規則（術語/角色/記憶工作流）
 */
export function getDataManagementRules(): string {
  return `【數據管理規則】
**狀態約束**:
- planning：可創建/更新術語、角色、記憶（輸出前唯一的數據維護窗口）
- working：僅執行翻譯/潤色/校對輸出，禁止數據寫入
- review：僅翻譯任務可用，且可創建/更新術語、角色、記憶

**術語/角色分離**:
- 術語表：專有名詞、概念、技能、地名、物品（⛔ 禁止放人名）
- 角色表：全名爲主名稱，姓/名爲別名（⛔ 禁止放術語）
- ⚠️ 每個術語只能有一個翻譯（如"龍套"而非"路人角色／龍套"）

**角色管理**: 新角色先檢查是否爲已有別名，描述需簡短（性別/關係/關鍵特徵）

⚠️ **保持數據最新**:
- 發現全名 → 更新主名稱，原名移入別名
- 發現新信息 → 在可寫階段儘快 \`update_term\`/\`update_character\`
- 空翻譯/重複/誤分類 → 在可寫階段儘快修復
- 新術語/角色 → 先檢查是否存在，不存在則創建`;
}

/**
 * 獲取記憶管理規則（精簡版）
 */
export function getMemoryWorkflowRules(): string {
  return `【記憶管理】
目標：**短、有效、可檢索、可複用**（寫少但寫對）

**⛔ 內容限制（重要）**：
- **只保留翻譯相關**：術語翻譯、角色名稱翻譯、文風偏好、特定短語翻譯選擇、敬語處理方式等
- **嚴禁存儲**：故事設定、背景、世界觀、劇情內容、情節發展等（這些屬於冗餘信息，不應占用記憶空間）
- 記憶的核心目的是幫助未來翻譯保持一致性和質量，而非記錄故事情節

**自動召回**：Embedding 可用時系統以語義相似度爲主、關鍵詞與時間衰減爲輔；不可用時回退到關鍵詞與時間衰減，自動選擇最相關的記憶注入翻譯上下文，無需手動關聯。
- 在 summary 和 content 中明確提及相關角色/術語名稱，可提升關鍵詞匹配得分

**搜索**：使用 \`search_memories\` 傳入自然語言查詢（如"主角的敬語習慣"），系統自動混合關鍵詞和語義檢索
- 需要詳細內容時用 \`get_memory\` 獲取完整記憶

**寫入規則**：
- 寫入時機：僅在可寫階段執行 \`create_memory\`/\`update_memory\`（planning；翻譯任務還可在 review）
- 寫入門檻：僅對未來有長期收益、可複用時才寫入（⛔ 一次性信息不寫入）
- ⚠️ **默認不新建**：優先合併到已有記憶，重寫爲更短清晰的版本

**字段約束**：summary ≤40字 + 關鍵詞 | content 1-3條要點（總 ≤300字）`;
}

/**
 * 獲取待辦事項工具描述（精簡版）
 */
function getTodoToolsDescription(_taskType: TaskType): string {
  return `**待辦管理**: 系統自動生成待辦清單，完成一項就用 \`mark_todo_done\` 標記（\`id\` 單條或 \`ids\` 批量，無需先標記進行中）。所有待辦完成後方可切換階段。`;
}

/**
 * 獲取狀態字段說明（精簡版）
 */
function getStatusFieldDescription(taskType: TaskType): string {
  return `**狀態流程**: ${getTaskStateWorkflowText(taskType)}`;
}

/**
 * 獲取工具化輸出格式規則（新方式：使用工具調用替代 JSON）
 */
export function getOutputFormatRules(
  taskType: TaskType,
  options?: { includeChapterTitle?: boolean; enableOriginalTextValidation?: boolean },
): string {
  const onlyChanged = taskType !== 'translation' ? '（只返回有變化的段落）' : '';
  const isTranslation = taskType === 'translation';
  // 標題翻譯指令僅在第一個 chunk 時包含（後續 chunk 標題已在第一個 chunk 中翻譯）
  const includeTitle = isTranslation && (options?.includeChapterTitle ?? true);
  const validateOriginal = options?.enableOriginalTextValidation === true;

  const titleToolSection = includeTitle
    ? '3. update_chapter_title（僅 working）參數：{"chapter_id": "章節ID", "title_translation": "標題翻譯"}'
    : '';

  const titleToolRestriction = includeTitle ? ' / update_chapter_title' : '';

  const toolRestriction = isTranslation
    ? `⛔ add_translation_batch${titleToolRestriction}：僅 working/review 可調用（單次上限 ${MAX_TRANSLATION_BATCH_SIZE} 段）
   - working 禁止創建/更新術語、角色、記憶
   - end 禁止再調用工具`
    : `⛔ add_translation_batch：僅 working 可調用（單次上限 ${MAX_TRANSLATION_BATCH_SIZE} 段）
   - working 禁止創建/更新術語、角色、記憶
   - end 禁止再調用工具`;

  return `【輸出格式】添加翻譯結果必須使用工具調用。按待辦清單順序執行。

**工具要點**
1. update_task_status：完成當前階段所有待辦後切換 {"status": "..."}
2. add_translation_batch：一次最多 ${MAX_TRANSLATION_BATCH_SIZE} 段，${validateOriginal ? '必須使用 paragraph_id + original_text_prefix 標識並錨定段落：{"paragraph_id": "xxx", "original_text_prefix": "原文前3-10字", "translated_text": "..."}（從段落 [ID: xxx] 與原文開頭提取，禁止使用 index 提交；原文不足3字時填完整原文）' : '必須使用 paragraph_id 標識段落：{"paragraph_id": "xxx", "translated_text": "..."}（從段落 [ID: xxx] 獲取，禁止使用 index 提交）'}${titleToolSection ? '\n' + titleToolSection : ''}
3. 若 add_translation_batch 返回結構化錯誤（如 error_code / invalid_items / invalid_paragraph_ids / failed_paragraphs），必須僅修復報錯條目後重試，禁止重排段落、猜測或替換 paragraph_id

${getStatusFieldDescription(taskType)}
- 段落 ID 與原文 1:1 對應${onlyChanged}
- ${isTranslation ? '必須全覆蓋' : '僅提交修改過的段落'}
${toolRestriction}

【用戶回報】
- 及時向用戶回報當前專注的任務以及翻譯進度
- 輸出要精簡，不要一次性輸出太多內容。

`;
}

/**
 * 獲取工具使用說明（精簡版）
 */
export function getToolUsageInstructions(
  taskType: TaskType,
  tools?: AITool[],
  skipAskUser?: boolean,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const askUserLine = !skipAskUser
    ? '- **詢問**: 當有需要用戶確認/做決定時，用 `ask_user_batch` 一次性解決所有疑問\n'
    : '';
  const queryChapterLine = hasQueryChapterTool(tools)
    ? '- **章節混合檢索**：需要跨章節回憶劇情/場景/人物關係/設定時，用 `query_chapter`（語義 + 標題/正文關鍵詞 + IDF 稀有詞加權 + 章號/卷號 identifier 強匹配），返回章節 ID、標題、匹配度、前 200 字預覽；再按需調 `get_chapter_info` 讀全文。\n' +
      '  - **三類最穩 query**：① 標題/系列名直搜（"第二王女" / "深淵之森攻略" / "星天 ⑥"）；② 人物+身份+具體動作+獨特細節（"夏洛特緊張到胃痛接近芬恩"）；③ 事件錨點（"吻痕被發現後開始審問"）。\n' +
      '  - **較弱**：抽象讀後感（"後宮氣氛成形"）→ 改成具體場面；僅人名無動作 → 補動作/細節；不存在的系列詞 → 改用 `list_chapters` 看真實標題。\n' +
      '  - **中文轉述日文標題**：字面差異大時不穩，**優先用原文標題詞**或加更強錨點（人物+動作）。\n' +
      '  - **把它當候選定位器**：Top1 未必最佳，默認看 Top3-5；不確定時 `limit` 調到 8-10。\n'
    : '';
  return `${getToolScopeRules(tools)}

【工具使用建議】
- 用途：獲取上下文、維護術語/角色/記憶、查詢歷史翻譯、查詢待辦事項。
- 優先用本地數據，網絡工具僅用於外部知識
${queryChapterLine}${askUserLine}- 最小必要：拿到信息後立刻回到${taskLabel}輸出
- ${getTodoToolsDescription(taskType)}`;
}
