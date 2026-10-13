// Same rules as the original Lexon Automation engine (apps/server/src/services/keywordMatch.ts).
export const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\s)+$/u
export const isEmojiOnly = (t: string) => EMOJI_ONLY.test(t.trim())
export interface TriggerConfig { triggerType: 'keywords' | 'any_comment'; matchMode: 'exact' | 'flexible'; keywords: string[]; excludedKeywords: string[]; allowEmojiOnly: boolean; allowShortComments: boolean }
export function commentMatchesTrigger(text: string, cfg: TriggerConfig): boolean {
  const c = normalize(text); if (!c) return false
  if (cfg.excludedKeywords.map(normalize).filter(Boolean).some(k => c.includes(k))) return false
  if (cfg.triggerType === 'any_comment') {
    const emo = isEmojiOnly(text)
    if (emo && !cfg.allowEmojiOnly) return false
    if (!emo && c.length < 3 && !cfg.allowShortComments) return false
    return true
  }
  const kws = [...new Set(cfg.keywords.map(normalize))].filter(Boolean)
  if (!kws.length) return false
  return cfg.matchMode === 'exact' ? kws.includes(c) : kws.some(k => c.includes(k))
}
