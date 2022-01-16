import { phrases } from '../i18n'

export function looseSetLanguage(lang) {
  const originalKeys = Object.keys(phrases.EE_languageNameNative)
  if (originalKeys.includes(lang)) return constructLangData(lang)

  const shortKeys = []
  originalKeys.forEach(l => {
    shortKeys.push(l.split('-')[0])
  })

  const shortLang = lang.split('-')[0].toLowerCase()

  if (shortKeys.includes(shortLang))
    return constructLangData(originalKeys[shortKeys.indexOf(shortLang)])

  return constructLangData('en-US')
}

function constructLangData(lang) {
  return {
    value: {
      language: lang,
      languageNameEnglish: phrases.EE_languageNameEnglish[lang],
      languageNameNative: phrases.EE_languageNameNative[lang],
      languageDirection: phrases.EE_languageDirection[lang],
      languagePhraseSource: phrases.EE_phraseSource[lang],
    },
    timestamp: new Date(),
  }
}

export function spaceForLanguage(L) {
  return phrases.EE_languageUseSpace[L] === '1' ? ' ' : ''
}
