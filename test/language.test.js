const assert = require('node:assert')

const { looseSetLanguage } = require('../src/components/language')
const { phrases } = require('../src/i18n/schema')
const { splitPhraseRow } = require('../i18n/phrase-row')

describe('phrase spreadsheet ingestion', function () {
  it('reads the phrase key from EE_LanguageCode only', function () {
    assert.deepEqual(
      splitPhraseRow({
        EE_LanguageCode: 'EE_LanguageEnglishName',
        en: 'English',
      }),
      {
        phraseKey: 'EE_LanguageEnglishName',
        translations: { en: 'English' },
      },
    )
    assert.equal(
      splitPhraseRow({ language: 'EE_languageNameEnglish', en: 'English' })
        .phraseKey,
      undefined,
    )
  })
})

describe('language compatibility', function () {
  before(function () {
    Object.assign(phrases, {
      EE_LanguageEnglishName: {
        en: 'English',
        fil: 'Filipino',
        'pt-pt': 'Portuguese',
        sw: 'Swahili',
        'zh-CN': 'Chinese (Simplified)',
        'zh-TW': 'Chinese (Traditional)',
      },
      EE_languageNameNative: {
        en: 'English',
        fil: 'Filipino',
        'pt-pt': 'Portugu\u00eas',
        sw: 'Kiswahili',
        'zh-CN': '\u7b80\u4f53\u4e2d\u6587',
        'zh-TW': '\u7e41\u9ad4\u4e2d\u6587',
      },
      EE_languageDirection: {
        en: 'LTR',
        fil: 'LTR',
        'pt-pt': 'LTR',
        sw: 'LTR',
        'zh-CN': 'LTR',
        'zh-TW': 'LTR',
      },
      EE_phraseSource: {
        en: 'test',
        fil: 'test',
        'pt-pt': 'test',
        sw: 'test',
        'zh-CN': 'test',
        'zh-TW': 'test',
      },
    })
  })

  it('maps historical Traditional Chinese to zh-TW', function () {
    assert.equal(looseSetLanguage('zh-HK').value.language, 'zh-TW')
  })

  it('keeps Simplified Chinese on its current zh-CN code', function () {
    assert.equal(looseSetLanguage('zh-CN').value.language, 'zh-CN')
  })

  it('maps historical Tagalog to Filipino', function () {
    assert.equal(looseSetLanguage('tl').value.language, 'fil')
  })

  it('maps historical Portuguese to pt-pt', function () {
    assert.equal(looseSetLanguage('pt').value.language, 'pt-pt')
  })

  it('maps historical English variants to en', function () {
    assert.equal(looseSetLanguage('en-US').value.language, 'en')
    assert.equal(looseSetLanguage('en-UK').value.language, 'en')
  })

  it('keeps Swahili without falling back', function () {
    assert.equal(looseSetLanguage('sw').value.language, 'sw')
  })

  it('reports an English fallback to its browser host', function () {
    const originalWindow = global.window
    let event
    global.window = {
      dispatchEvent: value => {
        event = value
      },
      CustomEvent: class {
        constructor(type, init) {
          this.type = type
          this.detail = init.detail
        }
      },
    }

    assert.equal(looseSetLanguage('hy').value.language, 'en')
    assert.equal(event.type, 'easyeyes-language-issue')
    assert.deepEqual(event.detail, {
      requestedLanguage: 'hy',
      resolvedLanguage: 'en',
      reason: 'fallback',
    })

    global.window = originalWindow
  })
})
