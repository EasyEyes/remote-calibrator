/**
 *
 * The fundamental functions, e.g. init
 *
 */

import platform from 'platform'
import DeviceDetector from 'device-detector-js'

import randomPhrases from './components/randomPhrases'
import { debug } from './constants'
import { getFullscreen, blurAll, constructInstructions } from './helpers'

class RemoteCalibrator {
  constructor() {
    this._initialized = false

    this._hasPanel = false
    this._panel = {
      panel: null,
      panelObserver: null,
    }

    this._id = null

    this._environmentData = []

    this._displayData = [] // Px
    this._screenData = [] // Cm
    this._viewingDistanceData = []
    this._nearPointData = []
    this._PDData = []

    this._gazePositionData = []
    this._gazeAccuracyData = []

    // Status
    this._fullscreenData = []

    this._background = {
      element: null,
      instructionElement: null,
    }

    this._params = {
      backgroundColor: '#ddd',
      videoOpacity: 0.8,
      showCancelButton: true,
    }

    this.deviceDetector = new DeviceDetector()
  }

  /* --------------------------------- GETTERS -------------------------------- */

  get background() {
    return this._background.element
  }

  get instructionElement() {
    return this._background.instructionElement
  }

  // PARAMS

  get params() {
    return this._params
  }

  ////

  get id() {
    return {
      value: this._id.value,
      timestamp: this._id.timestamp,
    }
  }

  /**
   * Help get a certain item from a given category
   */
  _helper_get(cat, name) {
    if (!cat.length) return null
    let thisData = cat[cat.length - 1]
    return name
      ? { value: thisData.value[name], timestamp: thisData.timestamp }
      : thisData
  }

  get version() {
    return {
      // eslint-disable-next-line no-undef
      value: process.env.VERSION,
    }
  }

  // Status

  get isFullscreen() {
    return {
      value:
        Math.abs(window.innerHeight - screen.height) < 5 &&
        Math.abs(window.innerWidth - screen.width) < 5 &&
        window.screenX < 5 &&
        window.screenY < 5,
      timestamp: new Date(),
    }
  }

  // Environment

  get bot() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'bot')
  }

  get browser() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'browser')
  }

  get browserVersion() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'browserVersion')
  }

  get deviceType() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'deviceType')
  }

  get model() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'model')
  }

  get manufacturer() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'manufacturer')
  }

  get engine() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'engine')
  }

  get system() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'system')
  }

  get systemFamily() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'systemFamily')
  }

  get description() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'description')
  }

  get fullDescription() {
    if (!this._environmentData.length) this.environment()
    return this._helper_get(this._environmentData, 'fullDescription')
  }

  // Screen

  get displayWidthPx() {
    if (!this._displayData.length) this.displaySize()
    return this._helper_get(this._displayData, 'displayWidthPx')
  }

  get displayHeightPx() {
    if (!this._displayData.length) this.displaySize()
    return this._helper_get(this._displayData, 'displayHeightPx')
  }

  get windowWidthPx() {
    if (!this._displayData.length) this.displaySize()
    return this._helper_get(this._displayData, 'windowWidthPx')
  }

  get windowHeightPx() {
    if (!this._displayData.length) this.displaySize()
    return this._helper_get(this._displayData, 'windowHeightPx')
  }

  get screenWidthCm() {
    return this._helper_get(this._screenData, 'screenWidthCm')
  }

  get screenHeightCm() {
    return this._helper_get(this._screenData, 'screenHeightCm')
  }

  get screenDiagonalCm() {
    return this._helper_get(this._screenData, 'screenDiagonalCm')
  }

  get screenDiagonalIn() {
    return this._helper_get(this._screenData, 'screenDiagonalIn')
  }

  get screenPpi() {
    return this._helper_get(this._screenData, 'screenPpi')
  }

  get screenPhysicalPpi() {
    return this._helper_get(this._screenData, 'screenPhysicalPpi')
  }

  // Distance

  get viewingDistanceCm() {
    return this._helper_get(this._viewingDistanceData)
  }

  get nearPointCm() {
    return this._helper_get(this._nearPointData)
  }

  get PDCm() {
    return this._helper_get(this._PDData)
  }

  // Gaze

  get gazePositionPx() {
    return this._helper_get(this._gazePositionData)
  }

  get gazeAccuracyDeg() {
    return this._helper_get(this._gazeAccuracyData)
  }

  /* -------------------------------- ALL DATA -------------------------------- */

  get displayData() {
    return this._displayData
  }

  get screenData() {
    return this._screenData
  }

  get viewingDistanceData() {
    return this._viewingDistanceData
  }

  get nearPointData() {
    return this._nearPointData
  }

  get PDData() {
    return this._PDData
  }

  get gazeData() {
    return this._gazePositionData
  }

  get fullScreenData() {
    return this._fullscreenData
  }

  get environmentData() {
    return this._environmentData
  }

  /* --------------------------------- SETTERS -------------------------------- */

  /**
   * @param {{ value: { displayWidthPx: number; displayHeightPx: number; windowWidthPx: number; windowHeightPx: number; }; timestamp: Date; }} data
   */
  set newDisplayData(data) {
    this._displayData.push(data)
  }

  /**
   * @param {{ value: { screenWidthCm: number; screenHeightCm: number; screenDiagonalCm: number; screenDiagonalIn: number; screenPpi: number; screenPhysicalPpi: number; }; timestamp: Date; }} data
   */
  set newScreenData(data) {
    this._screenData.push(data)
  }

  /**
   * @param {{ value: number; timestamp: Date; method: string; }} data
   */
  set newViewingDistanceData(data) {
    this._viewingDistanceData.push(data)
  }

  /**
   * @param {{ value: { x: number; y: number; }; timestamp: Date; }} data
   */
  set newNearPointData(data) {
    this._nearPointData.push(data)
  }

  /**
   * @param {{ value: number; timestamp: Date; }} data
   */
  set newPDData(data) {
    this._PDData.push(data)
  }

  /**
   * @param {{ value: { x: number; y: number; }; timestamp: Date; }} data
   */
  set newGazePositionData(data) {
    this._gazePositionData.push(data)
  }

  /**
   * @param {{ value: number; timestamp: Date; }} data
   */
  set newGazeAccuracyData(data) {
    this._gazeAccuracyData.push(data)
  }

  /**
   * @param {{ value: { browser: string; browserVersion: string; model: string; manufacturer: string; engine: string; system: string; systemFamily: string; description: string; fullDescription: string; }; timestamp: Date; }} data
   */
  set newEnvironmentData(data) {
    this._environmentData.push(data)
  }

  /**
   * @param {{ value: boolean; timestamp: Date; }} data
   */
  set newFullscreenData(data) {
    this._fullscreenData.push(data)
  }
}

/**
 *
 * Must be called before any other functions
 *
 */
RemoteCalibrator.prototype.init = function (options = {}, callback) {
  if (!this._initialized) {
    this._initialized = true
    options = Object.assign(
      {
        id: randomPhrases(),
        fullscreen: false,
      },
      options
    )

    if (options.fullscreen && !debug) getFullscreen()

    this._id = {
      value: options.id,
      timestamp: new Date(),
    }

    if (callback) callback(this._id)
  }
}

/**
 *
 * Get the environment data, e.g. browser type
 *
 */
RemoteCalibrator.prototype.environment = function (callback) {
  if (this.checkInitialized()) {
    blurAll()

    const device = this.deviceDetector.parse(platform.ua)
    const bot = device.bot

    const data = {
      value: {
        bot: bot ? `${bot.name} (${bot.category}) by ${bot.producer.name}` : '',
        browser: platform.name,
        browserVersion: platform.version,
        deviceType: device.device.type,
        model: platform.product || device.device.model,
        manufacturer: platform.manufacturer || device.device.brand,
        engine: platform.layout,
        system: platform.os.toString(),
        systemFamily: platform.os.family,
        description: platform.description,
        fullDescription: platform.ua,
      },
      timestamp: this.id.timestamp,
    }

    this.newEnvironmentData = data

    if (callback) callback(data)
  }
}

/**
 *
 * Check if RemoteCalibrator is initialized
 *
 */
RemoteCalibrator.prototype.checkInitialized = function () {
  if (this._initialized) return true
  console.error('RemoteCalibrator is not initialized.')
  return false
}

/**
 * Get fullscreen
 * @param {Boolean} f Get fullscreen or not from options
 */
RemoteCalibrator.prototype.getFullscreen = function (f = true) {
  if (
    window.fullScreen ||
    (window.innerWidth === screen.width && window.innerHeight === screen.height)
  ) {
    return true
  }

  if (f && !debug) getFullscreen()

  this.newFullscreenData = {
    value: f && !debug,
    timestamp: new Date(),
  }

  return f && !debug
}

/**
 *
 * Add background
 *
 */
RemoteCalibrator.prototype._addBackground = function (inner) {
  if (this.background !== null) return

  let b = document.getElementById('calibration-background')
  if (!b) {
    b = document.createElement('div')
    b.id = 'calibration-background'
    document.body.appendChild(b)

    b.style.background = this.params.backgroundColor
  }

  if (inner) b.innerHTML = inner

  this._background.element = b
}

/**
 *
 * Replace background with a new one
 */
RemoteCalibrator.prototype._replaceBackground = function (inner) {
  if (this.background !== null) this._removeBackground()
  return this._addBackground(inner)
}

/**
 *
 * Remove background
 *
 */
RemoteCalibrator.prototype._removeBackground = function () {
  let b = document.getElementById('calibration-background')
  if (b) {
    document.body.removeChild(b)

    this._background = {
      element: null,
      instructionElement: null,
    }
    // There is a background and remove successfully
    return true
  }
  // Cannot find the background
  return false
}

/**
 * Add page headline and short descriptions
 */
RemoteCalibrator.prototype._addBackgroundText = function (
  headline,
  shortDescription
) {
  // Remove the old if there's any
  let ins = this.background.getElementsByClassName('calibration-instruction')

  for (let i = 0; i < ins.length; i++) {
    this.background.removeChild(ins[i])
  }

  this.background.innerHTML = constructInstructions(headline, shortDescription)
}

/**
 * Construct a floating <p> element for instructions and append to the parent (background) element
 * @param {string} id id of the element
 * @param {string} text init text
 */
RemoteCalibrator.prototype._constructFloatInstructionElement = function (
  id = null,
  text
) {
  if (this.background === null) this._addBackground()

  if (this.instructionElement !== null) {
    if (this.instructionElement.id === id) return
    else {
      this.background.removeChild(this.instructionElement)
      this._background.instructionElement = null
    }
  }

  const instP = document.createElement('p')
  instP.className = 'float-instruction'
  instP.id = id || 'float-instruction'

  instP.innerHTML = text // Init
  this.background.appendChild(instP)

  return (this._background.instructionElement = instP)
}

RemoteCalibrator.prototype._removeFloatInstructionElement = function () {
  if (this.instructionElement) {
    this.background.removeChild(this.instructionElement)
    this._background.instructionElement = null
    return this.background
  }
  return false
}

export default RemoteCalibrator
