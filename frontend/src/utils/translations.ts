export type Lang = "en" | "zh-TW";

export const SCORE_BAND_TW: Record<string, string> = {
  "Top-school competitive range":                   "頂尖學校競爭水準",
  "Competitive range for specialized schools":      "特色學校競爭水準",
  "Approaching competitive — keep going!":          "接近競爭水準，繼續加油！",
  "Keep practicing — you're building real skills!": "持續練習，你正在穩步提升！",
};

export const SUBCAT_TW: Record<string, string> = {
  Authors_Perspective: "作者的觀點立場", "Author's Perspective": "作者的觀點立場",
  Authors_Point_of_View: "作者的敘述視角", "Author's Point of View": "作者的敘述視角",
  Authors_Purpose: "作者的寫作目的", "Author's Purpose": "作者的寫作目的",
  "Author's Purpose & Tone": "作者目的與語氣", Authors_Purpose_and_Tone: "作者目的與語氣",
  Central_Idea: "中心思想", "Central Idea": "中心思想",
  Comma_Usage: "逗號用法", "Comma Usage": "逗號用法",
  Figurative_Language: "修辭手法", "Figurative Language": "修辭手法",
  Inference: "推理",
  Inference_and_Implied_Ideas: "推理與隱含含義", "Inference and Implied Ideas": "推理與隱含含義",
  Main_Idea: "段落主旨", "Main Idea": "段落主旨",
  "Organization-Concluding_Sentence": "段落組織：結尾句",
  "Organization-Logical_Placement": "段落組織：邏輯排列",
  "Organization-Paragraph_Unity": "段落組織：段落統一",
  "Organization-Topic_Sentence": "段落組織：主題句",
  "Organization-Transitions": "段落組織：過渡語",
  Plot_Development: "情節發展", "Plot Development": "情節發展",
  Poetic_Technique: "詩歌技巧", "Poetic Technique": "詩歌技巧",
  Point_of_View: "敘述視角", "Point of View": "敘述視角",
  Pronoun_Agreement: "代詞一致性", "Pronoun Agreement": "代詞一致性",
  Punctuation: "標點符號",
  Sentence_Combining: "句子合併", "Sentence Combining": "句子合併",
  Sentence_Structure: "句子結構", "Sentence Structure": "句子結構",
  Setting: "場景與背景",
  "Style-Word_Choice": "寫作風格：用詞選擇",
  "Subject-Verb_Agreement": "主謂一致性", "Subject Verb Agreement": "主謂一致性",
  Summarization: "文章概括",
  Supporting_Details: "支持性細節", "Supporting Details": "支持性細節",
  Text_Feature: "文本特徵", "Text Feature": "文本特徵",
  Text_Organization: "文章組織", "Text Organization": "文章組織",
  Text_Structure: "文章結構", "Text Structure": "文章結構",
  Textual_Evidence: "文本依據", "Textual Evidence": "文本依據",
  Textual_Evidence_and_Reasoning: "文本依據與推理", "Textual Evidence and Reasoning": "文本依據與推理",
  Theme: "文章主題", Tone: "文章語氣",
  "Usage_&_Grammar": "語言用法與語法", "Usage & Grammar": "語言用法與語法",
  Verb_Tense: "動詞時態", "Verb Tense": "動詞時態",
  Vocabulary_in_Context: "語境詞彙", "Vocabulary in Context": "語境詞彙",
  Word_Choice: "詞語選擇", "Word Choice": "詞語選擇",
  Algebra_and_Equations: "代數與方程式", "Algebra and Equations": "代數與方程式", "Algebra & Equations": "代數與方程式",
  Algebraic_Expressions: "代數式", "Algebraic Expressions": "代數式",
  Arithmetic: "基礎算術",
  Fraction_Word_Problems: "分數應用題", "Fraction Word Problems": "分數應用題",
  Geometry: "幾何", Inequalities: "不等式",
  "Linear_Eq._Formula": "線性方程式", "Linear Eq. Formula": "線性方程式",
  Percentage: "百分比", Probability: "機率",
  "Rate-Unit_Rate": "速率／單位速率", "Rate / Unit Rate": "速率／單位速率", "Rate/Unit Rate": "速率／單位速率",
  Ratios_and_Proportions: "比例關係", "Ratios and Proportions": "比例關係", "Ratios & Proportions": "比例關係",
  Sequence: "數列規律",
  Stats_and_Data_Analysis: "統計與資料分析", "Stats and Data Analysis": "統計與資料分析", "Stats & Data Analysis": "統計與資料分析",
  Statistics: "統計",
  General: "綜合", Uncategorized: "未分類",
};

export function fmtSubEN(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/^Organization-/, "Org: ")
    .replace(/^Style-/, "Style: ")
    .replace(/\bEq\b\.?/g, "Eq.")
    .replace(/\band\b/g, "&");
}

export function fmtSubLocalized(raw: string, lang: Lang): string {
  if (lang === "zh-TW") return SUBCAT_TW[raw] ?? fmtSubEN(raw);
  return fmtSubEN(raw);
}
