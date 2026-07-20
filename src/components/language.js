import { phrases } from '../i18n/schema'

export function looseSetLanguage(lang) {
  const originalKeys = Object.keys(phrases.EE_LanguageNativeName)
  if (originalKeys.includes(lang)) return constructLangData(lang)

  const shortKeys = []
  originalKeys.map(l => {
    shortKeys.push(l.split('-')[0])
  })

  const shortLang = lang.split('-')[0].toLowerCase()

  if (shortKeys.includes(shortLang))
    return constructLangData(originalKeys[shortKeys.indexOf(shortLang)])

  return constructLangData('en')
}

function constructLangData(lang) {
  return {
    value: {
      language: lang,
      languageNameEnglish: phrases.EE_LanguageEnglishName[lang],
      languageNameNative: phrases.EE_LanguageNativeName[lang],
      languageDirection: phrases.EE_LanguageDirection[lang],
      languagePhraseSource: phrases.EE_phraseSource[lang],
    },
    timestamp: performance.now(),
  }
}

export function spaceForLanguage(L) {
  return phrases.EE_LanguageUsesSpacesBool[L] === 'TRUE' ? ' ' : ''
}
