const assert = require('node:assert')

const { loadPhrases } = require('../src/i18n/loadPhrases')
const { phrases } = require('../src/i18n/schema')

describe('loadPhrases — phrase resolution', function () {
  it('populates the phrase registry with the supplied table', async function () {
    const supplied = { RC_ok: { en: 'SENTINEL_SUPPLIED' } }

    await loadPhrases(supplied)

    assert.strictEqual(phrases.RC_ok['en'], 'SENTINEL_SUPPLIED')
  })

  it('leaves the phrase registry unchanged when no table is supplied', async function () {
    const keysBefore = Object.keys(phrases).length

    await loadPhrases(undefined)

    assert.strictEqual(Object.keys(phrases).length, keysBefore)
  })
})
