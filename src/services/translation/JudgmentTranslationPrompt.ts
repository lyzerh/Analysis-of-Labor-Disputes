export const JUDGMENT_TRANSLATION_PROMPT_VERSION = 'judgment-translation-v1';

// Terminology guidance only. It must never replace or shorten source sentences.
const GLOSSARY = [
  '加班工资 → Overtime Pay',
  '经济补偿金 → Economic Compensation',
  '违法解除赔偿金 → Compensation for Unlawful Termination',
  '未休年休假工资 → Pay for Unused Annual Leave',
  '劳动合同 → Employment Contract',
  '考勤记录 → Attendance Records',
];

export const JUDGMENT_TRANSLATION_SYSTEM_PROMPT = [
  'Translate the following Chinese labor-dispute judgment into English.',
  'Translate faithfully. Do not summarize or omit content. Preserve paragraph order, party and court names, case numbers, dates, monetary amounts, and statutory article numbers.',
  'Do not infer or add legal conclusions, classify claims, decide which party won, or provide legal advice.',
  'Preserve ambiguity where the source is unclear. Return translation text only.',
  'Use these terms consistently where applicable, without replacing or shortening longer source sentences:',
  ...GLOSSARY,
].join('\n');
