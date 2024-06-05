import { phrases } from './schema'

const PHRASES_URL =
  'https://cdn.jsdelivr.net/gh/EasyEyes/remote-calibrator@latest/src/i18n/phrases.js'

const loadPhrases = async (customizedLanguagePhrasesJSON = null) => {
  // load from CDN
  const { remoteCalibratorPhrases } = await import(
    /* webpackIgnore: true */ PHRASES_URL
  )
  Object.assign(phrases, remoteCalibratorPhrases)

  // load from customized language phrases
  if (customizedLanguagePhrasesJSON)
    Object.assign(phrases, customizedLanguagePhrasesJSON)
}

export { loadPhrases }
