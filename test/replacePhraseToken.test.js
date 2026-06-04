const assert = require('node:assert')

const { replacePhraseToken } = require('../src/i18n/replacePhraseToken')

describe('replacePhraseToken', function () {
  it('replaces [[XXX]] with the supplied markup', function () {
    const markup = '<select id="matching-obj"><option>card</option></select>'
    const phrase = 'Please select [[XXX]] as reference.'

    const result = replacePhraseToken(phrase, markup)

    assert.strictEqual(result, 'Please select ' + markup + ' as reference.')
  })

  it('returns the phrase unchanged when [[XXX]] is absent', function () {
    const phrase = 'No token in this phrase'

    const result = replacePhraseToken(phrase, '<select></select>')

    assert.strictEqual(result, phrase)
  })
})
