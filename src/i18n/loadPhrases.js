import { phrases } from './schema'
import { processInlineFormatting } from '../distance/markdownInstructionParser'

// Pre-render every phrase value from Markdown → HTML at load time so that
// all reads from `phrases[key][lang]` return ready-to-insert HTML.
// Use innerHTML (not textContent) for all phrase insertions. The only
// exception is placeholder attributes, which are always plain text.
const loadPhrases = async customizedLanguagePhrasesJSON => {
  if (customizedLanguagePhrasesJSON) {
    for (const key of Object.keys(customizedLanguagePhrasesJSON)) {
      const langMap = customizedLanguagePhrasesJSON[key]
      if (langMap && typeof langMap === 'object') {
        for (const lang of Object.keys(langMap)) {
          if (typeof langMap[lang] === 'string') {
            langMap[lang] = processInlineFormatting(langMap[lang])
          }
        }
      }
    }
    Object.assign(phrases, customizedLanguagePhrasesJSON)
  }
}

export { loadPhrases }
