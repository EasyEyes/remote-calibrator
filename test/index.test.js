const assert = require('node:assert')

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.self = dom.window.self
global.navigator = dom.window.navigator
global.screen = dom.window.screen

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
