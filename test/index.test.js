const assert = require('node:assert')

require('./loadPhrases.test')
require('./replacePhraseToken.test')
require('./markdownRendering.test')

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.self = dom.window.self
global.navigator = dom.window.navigator
global.screen = dom.window.screen

// Loads src/index.js — must come after the JSDOM globals above.
require('./recalibrateRestart.test')
require('./ensureVideoPlaying.test')
require('./cameraMonitor.test')
require('./cameraCommitGate.test')
require('./interactionLifecycle.test')
require('./interactionManagement.test')
require('./objectRecoveryOwnership.test')
require('./cameraRecoveryDeadEnds.test')
require('./interactionTermination.test')

const packageJSON = require('../package.json')

describe('Installation', function () {
  describe('import', function () {
    global.RC = require('../src/index.js').default

    it('can be imported', function () {
      assert.ok(global.RC)
    })

    it('should not be initialized yet', function () {
      assert.equal(global.RC._initialized, false)
    })

    it('should have default parameters', function () {
      assert.deepEqual(global.RC._params, {
        backgroundColor: '#eee',
        videoOpacity: 0.8,
        showCancelButton: true,
      })
    })
  })
})

describe('Initialization', function () {
  describe('initialize', function () {
    it('initialize', function () {
      global.RC.init()
    })

    it('should have the correct version', function () {
      assert.equal(global.RC.version.value, packageJSON.version)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "New object" restart (page 3) must fully reset measurement + paper state.
// Field bug (studies 127-129): the button handler calls
// context.resetMeasurementState() and context.resetPaperSelectionState(),
// which were never defined → "TypeError: e.resetMeasurementState is not a
// function at HTMLButtonElement.<anonymous>" — the participant is stranded
// on a dead popup.
// ─────────────────────────────────────────────────────────────────────────────
describe('New-object restart state reset', function () {
  const {
    createMeasurementState,
  } = require('../src/distance/object/measurementState')

  function dirtyState() {
    const s = createMeasurementState({
      objectMeasurementCount: 3,
      isPaperSelectionModeBool: false,
    })
    s.currentIteration = 2
    s.totalIterations = 9
    s.measurements = [{ objectLengthCm: 5.1 }, { objectLengthCm: 7.3 }]
    s.rejectionCount = 4
    s.factorRejectionCount = 2
    s.lastAttemptWasTooShort = true
    s.lastAttemptWasTooShortBool = true
    s.consistentPair = { indices: [0, 1] }
    return s
  }

  it('factory exposes reset()', function () {
    const s = dirtyState()
    assert.strictEqual(typeof s.reset, 'function')
  })

  it('reset() restores initial iteration state', function () {
    const s = dirtyState()
    s.reset()
    assert.strictEqual(s.currentIteration, 1)
    assert.strictEqual(s.totalIterations, 3)
    assert.deepStrictEqual(s.measurements, [])
    assert.strictEqual(s.rejectionCount, 0)
    assert.strictEqual(s.factorRejectionCount, 0)
    assert.strictEqual(s.lastAttemptWasTooShort, false)
    assert.strictEqual(s.lastAttemptWasTooShortBool, false)
    assert.strictEqual(s.consistentPair, null)
  })

  it('objectTestUI deps expose the context methods the button handler calls', function () {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/distance/object/objectTestUI.js'),
      'utf8',
    )
    assert.ok(
      src.includes('resetMeasurementState'),
      'objectTestUI must expose resetMeasurementState on the deps object',
    )
    assert.ok(
      src.includes('resetPaperSelectionState'),
      'objectTestUI must expose resetPaperSelectionState on the deps object',
    )
  })

  it('Enter-key auto-click on page 3 popup is null-safe', function () {
    const src = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '../src/distance/object/spaceKeyHandler.js',
      ),
      'utf8',
    )
    assert.ok(
      /\?\.\s*click\(\)/.test(src),
      'auto-click must use optional chaining: getElementById(...)?.click()',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tracking publish: a divergent face-pose frame computes nearestXYPx of
// [±Infinity, ±Infinity] (lateral offset = tan of yaw → ∞). Consumers treat
// the published cache as "latest estimate"; publishing a non-finite position
// poisons them (field bug studies 127-129: validateFinitePair crash). Publish
// null for non-finite — an explicit "no valid estimate this frame" — never a
// silently-fabricated last position.
// ─────────────────────────────────────────────────────────────────────────────
describe('Tracking nearestXYPx publish sanitization', function () {
  const { finitePairOrNull } = require('../src/distance/distanceTrack.js')

  it('keeps a finite 2-vector', function () {
    assert.deepStrictEqual(finitePairOrNull([12.5, -3.25]), [12.5, -3.25])
  })

  it('nulls Infinity (field shape)', function () {
    assert.strictEqual(finitePairOrNull([Infinity, Infinity]), null)
  })

  it('nulls NaN, wrong length, non-array, null', function () {
    for (const bad of [[1, NaN], [4], undefined, null]) {
      assert.strictEqual(finitePairOrNull(bad), null)
    }
  })

  it("distanceTrack's publish site routes all three nearestXYPx through it", function () {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/distance/distanceTrack.js'),
      'utf8',
    )
    const uses = (src.match(/finitePairOrNull\(/g) || []).length
    assert.ok(uses >= 3, `expected >=3 uses (left/right/main), got ${uses}`)
  })
})
