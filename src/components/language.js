import { phrases } from '../i18n/schema'

const historicalLanguageAliases = {
  'en-US': 'en',
  'en-UK': 'en',
  'zh-HK': 'zh-TW',
  tl: 'fil',
  pt: 'pt-pt',
}

const reportLanguageIssue = detail => {
  if (
    typeof window === 'undefined' ||
    typeof window.CustomEvent === 'undefined'
  )
    return
  window.dispatchEvent(
    new window.CustomEvent('easyeyes-language-issue', { detail }),
  )
}

export function looseSetLanguage(lang) {
  const originalKeys = Object.keys(phrases.EE_languageNameNative)
  if (originalKeys.includes(lang)) return constructLangData(lang)

  const alias = historicalLanguageAliases[lang]
  if (alias && originalKeys.includes(alias)) {
    reportLanguageIssue({
      requestedLanguage: lang,
      resolvedLanguage: alias,
      reason: 'alias',
    })
    return constructLangData(alias)
  }

  const shortKeys = []
  originalKeys.map(l => {
    shortKeys.push(l.split('-')[0])
  })

  const shortLang = lang.split('-')[0].toLowerCase()

  if (shortKeys.includes(shortLang))
    return constructLangData(originalKeys[shortKeys.indexOf(shortLang)])

  reportLanguageIssue({
    requestedLanguage: lang,
    resolvedLanguage: 'en',
    reason: 'fallback',
  })
  return constructLangData('en')
}

function constructLangData(lang) {
  return {
    value: {
      language: lang,
      languageNameEnglish: phrases.EE_LanguageEnglishName[lang],
      languageNameNative: phrases.EE_languageNameNative[lang],
      languageDirection: phrases.EE_languageDirection[lang],
      languagePhraseSource: phrases.EE_phraseSource[lang],
    },
    timestamp: performance.now(),
  }
}

export function spaceForLanguage(L) {
  return phrases.EE_languageUsesSpacesBool[L] === 'TRUE' ? ' ' : ''
}
