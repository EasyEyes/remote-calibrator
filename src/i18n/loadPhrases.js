import { phrases } from './schema'
import pRetry from 'p-retry'

const PHRASES_URL =
  'https://cdn.jsdelivr.net/gh/EasyEyes/remote-calibrator@latest/src/i18n/phrases.js'

const loadPhrases = async customizedLanguagePhrasesJSON => {
  // Load from CDN with retries
  const module = await pRetry(
    async () => {
      try {
        return await import(/* webpackIgnore: true */ PHRASES_URL)
      } catch (err) {
        throw new Error('Dynamic import failed: ' + err.message)
      }
    },
    {
      retries: 10,
      minTimeout: 1000,
      maxTimeout: 30000,
      onFailedAttempt(error) {
        console.error(
          `Attempt ${error.attemptNumber} failed: ${error.message}. ${
            error.retriesLeft
              ? `${error.retriesLeft} retries left.`
              : 'No more retries.'
          }`,
        )
      },
    },
  )

  const { remoteCalibratorPhrases } = module

  // Merge CDN phrases
  Object.assign(phrases, remoteCalibratorPhrases)

  // Merge custom phrases (if provided)
  if (customizedLanguagePhrasesJSON) {
    Object.assign(phrases, customizedLanguagePhrasesJSON)
  }
}

export { loadPhrases }
