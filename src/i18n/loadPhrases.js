import { phrases } from './schema'

const loadPhrases = async customizedLanguagePhrasesJSON => {
  if (customizedLanguagePhrasesJSON) {
    Object.assign(phrases, customizedLanguagePhrasesJSON)
  }
}

export { loadPhrases }
