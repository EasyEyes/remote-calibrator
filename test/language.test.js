const assert = require('node:assert')

const { looseSetLanguage } = require('../src/components/language')
const { phrases } = require('../src/i18n/schema')

const LANGUAGE_KEYS = [
  'EE_LanguageNativeName',
  'EE_LanguageEnglishName',
  'EE_LanguageDirection',
  'EE_phraseSource',
]

const ENGLISH_LANGUAGE_DATA = {
  EE_LanguageNativeName: { en: 'English' },
  EE_LanguageEnglishName: { en: 'English' },
  EE_LanguageDirection: { en: 'LTR' },
}

describe('Language metadata', function () {
  let saved

  beforeEach(function () {
    saved = {}
    for (const key of LANGUAGE_KEYS) {
      saved[key] = phrases[key]
      delete phrases[key]
    }
    Object.assign(phrases, ENGLISH_LANGUAGE_DATA)
  })

  afterEach(function () {
    for (const key of LANGUAGE_KEYS) {
      delete phrases[key]
      if (saved[key] !== undefined) phrases[key] = saved[key]
    }
  })

  it('constructs language data when optional phrase provenance is absent', function () {
    const data = looseSetLanguage('en')

    assert.strictEqual(data.value.language, 'en')
    assert.strictEqual(data.value.languageNameEnglish, 'English')
    assert.strictEqual(data.value.languageNameNative, 'English')
    assert.strictEqual(data.value.languageDirection, 'LTR')
    assert.strictEqual(data.value.languagePhraseSource, undefined)
  })

  it('preserves phrase provenance when supplied', function () {
    phrases.EE_phraseSource = { en: 'SENTINEL_PROVENANCE' }

    const data = looseSetLanguage('en')

    assert.strictEqual(data.value.languagePhraseSource, 'SENTINEL_PROVENANCE')
  })
})
