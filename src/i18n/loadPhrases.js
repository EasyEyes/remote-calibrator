import { phrases } from './schema'
import pRetry from 'p-retry'

const PHRASES_URL =
  'https://cdn.jsdelivr.net/gh/EasyEyes/remote-calibrator@latest/src/i18n/phrases.js'

const loadPhrases = async (customizedLanguagePhrasesJSON) => {
  // Load from CDN with retries
  const { remoteCalibratorPhrases } = await pRetry(
    async (attemptCount) => {
      // Optional: log attempts (remove in production if you don't want console noise)
      if (attemptCount > 1) {
        console.warn(`Loading phrases from CDN (attempt ${attemptCount})...`)
      }

      const module = await import(
        /* webpackIgnore: true */ PHRASES_URL + `?v=${Date.now()}`
        )

      if (!module.remoteCalibratorPhrases) {
        throw new Error('remoteCalibratorPhrases not found in imported module')
      }

      return module
    },
    {
      retries: 5,                    // Total attempts = 1 initial + 5 retries = 6
      factor: 2,                     // Exponential backoff
      minTimeout: 1000,              // Start with 1s delay
      maxTimeout: 10000,             // Cap at 10s
      onFailedAttempt: (error) => {
        console.error(
          `Attempt ${error.attemptNumber} failed: ${error.message}. ${
            error.retriesLeft === 0 ? 'No more retries.' : `${error.retriesLeft} retries left.`
          }`
        )
      },
    }
  )

  // Merge CDN phrases
  Object.assign(phrases, remoteCalibratorPhrases)

  // Merge custom phrases (if provided)
  if (customizedLanguagePhrasesJSON) {
    Object.assign(phrases, customizedLanguagePhrasesJSON)
  }
}

export { loadPhrases }
