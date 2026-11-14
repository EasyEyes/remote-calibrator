const assert = require('node:assert')

// Seals the shared instruction media cache, so it must run after every other
// test that renders instruction media.
describe('Sealed instruction media never touches the network', function () {
  const {
    cacheInstructionMedia,
    fetchBlobOnce,
    preloadInstructionMediaWithProgress,
    resolveInstructionMediaUrl,
    sealInstructionMedia,
  } = require('../src/distance/instructionMediaCache.js')

  const preloaded = 'https://media.example/preloaded.mp4'
  const missing = 'https://media.example/missing-from-manifest.mp4'
  let fetched
  let originalFetch

  before(function () {
    originalFetch = global.fetch
    fetched = []
    global.fetch = async url => {
      fetched.push(url)
      return new Response('late bytes')
    }
    cacheInstructionMedia(preloaded, new Blob(['early bytes']))
    sealInstructionMedia()
  })

  after(function () {
    global.fetch = originalFetch
  })

  it('serves preloaded media from its blob', function () {
    assert.match(resolveInstructionMediaUrl(preloaded), /^blob:/)
  })

  it('fails hard on media missing from the manifest', async function () {
    assert.throws(
      () => resolveInstructionMediaUrl(missing),
      /Instruction media was not preloaded/,
    )
    await assert.rejects(
      fetchBlobOnce(missing, null),
      /Instruction media was not preloaded/,
    )
  })

  it('skips the standalone download fallback once sealed', async function () {
    await preloadInstructionMediaWithProgress(null, [missing])
    assert.equal(document.getElementById('rc-loading-video-message'), null)
  })

  it('made no network request after sealing', async function () {
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(fetched, [])
  })
})
