import { phrases } from './i18n'

const PHRASES_URL =
  'https://cdn.jsdelivr.net/gh/EasyEyes/remote-calibrator-phrases@main/phrases/main.js'

const loadPhrases = async () => {
  const { remoteCalibratorPhrases } = await import(
    /* webpackIgnore: true */ PHRASES_URL
  )
  Object.assign(phrases, remoteCalibratorPhrases)
}

export { loadPhrases }
