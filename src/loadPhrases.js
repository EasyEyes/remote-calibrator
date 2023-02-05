import { phrases } from './i18n'

const PHRASES_URL =
  'https://cdn.jsdelivr.net/gh/EasyEyes/remote-calibrator-phrases@latest/phrases/main.js'

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
