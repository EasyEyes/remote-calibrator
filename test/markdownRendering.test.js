const assert = require('node:assert')

const { loadPhrases } = require('../src/i18n/loadPhrases')
const { phrases } = require('../src/i18n/schema')
const {
  processInlineFormatting,
} = require('../src/distance/markdownInstructionParser')

describe('Markdown rendering — loadPhrases pre-rendering', function () {
  // Use unique keys to avoid clashing with other tests that share the global
  // phrases registry (no beforeEach cleanup in the existing suite).
  const K = prefix => `RC_MD_TEST_${prefix}`

  it('pre-renders **bold** → <strong> at load time', async function () {
    await loadPhrases({ [K('BOLD')]: { en: 'Hit the **SPACE** bar' } })
    assert.strictEqual(
      phrases[K('BOLD')]['en'],
      'Hit the <strong>SPACE</strong> bar',
    )
  })

  it('pre-renders *italic* → <em> at load time', async function () {
    await loadPhrases({ [K('ITALIC')]: { en: 'Use the *arrow* key' } })
    assert.strictEqual(phrases[K('ITALIC')]['en'], 'Use the <em>arrow</em> key')
  })

  it('pre-renders `code` → <code> at load time', async function () {
    await loadPhrases({ [K('CODE')]: { en: 'Press `ESC` to exit' } })
    assert.strictEqual(
      phrases[K('CODE')]['en'],
      'Press <code>ESC</code> to exit',
    )
  })

  it('preserves phrases without markdown unchanged', async function () {
    await loadPhrases({ [K('PLAIN')]: { en: 'Proceed' } })
    assert.strictEqual(phrases[K('PLAIN')]['en'], 'Proceed')
  })

  it('renders each language independently', async function () {
    await loadPhrases({
      [K('MULTI')]: {
        en: 'Hit **SPACE**',
        fr: 'Appuyez sur **ESPACE**',
      },
    })
    assert.strictEqual(phrases[K('MULTI')]['en'], 'Hit <strong>SPACE</strong>')
    assert.strictEqual(
      phrases[K('MULTI')]['fr'],
      'Appuyez sur <strong>ESPACE</strong>',
    )
  })

  it('double-wrapping is safe (idempotent on pre-rendered phrases)', async function () {
    await loadPhrases({ [K('IDEM')]: { en: 'Hit the **SPACE** bar' } })
    const once = phrases[K('IDEM')]['en']
    const twice = processInlineFormatting(once)
    assert.strictEqual(twice, once)
  })

  it('phrase already containing HTML tags is not double-processed', async function () {
    // A phrase that already has <strong> (e.g. from a future sheet edit)
    // must survive loadPhrases without being mangled.
    await loadPhrases({
      [K('HTML')]: { en: '<strong>OK</strong> and **bold**' },
    })
    // The idempotency guard sees <strong> and returns the text unchanged,
    // so the literal **bold** is NOT rendered. This is the documented
    // trade-off of processInlineFormatting's idempotency design.
    assert.strictEqual(
      phrases[K('HTML')]['en'],
      '<strong>OK</strong> and **bold**',
    )
  })

  it('non-string values are left untouched', async function () {
    await loadPhrases({
      [K('NUM')]: { en: 42, fr: true },
    })
    assert.strictEqual(phrases[K('NUM')]['en'], 42)
    assert.strictEqual(phrases[K('NUM')]['fr'], true)
  })

  it('loadPhrases(null) does not throw or modify the registry', async function () {
    const keysBefore = Object.keys(phrases).length
    await loadPhrases(null)
    assert.strictEqual(Object.keys(phrases).length, keysBefore)
  })
})
