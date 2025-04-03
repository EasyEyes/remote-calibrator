/**
 *
 * The fundamental functions, e.g. init
 *
 */

import platform from 'platform'
import isEqual from 'react-fast-compare'

import randomPhrases from './components/randomPhrases'
import { debug } from './debug'
import {
  getFullscreen,
  blurAll,
  constructInstructions,
  isFullscreen,
  safeExecuteFunc,
  replaceNewlinesWithBreaks,
} from './components/utils'
import { looseSetLanguage } from './components/language'
import { phrases } from './i18n/schema'
import { loadPhrases } from './i18n/loadPhrases'
import { clearAllHandlers_key_resp_allKeys } from './extensions/keypadHandler'

// eslint-disable-next-line no-undef
export const env = process.env.BUILD_TARGET

class RemoteCalibrator {
  constructor() {
    window.console.log(
      `%c\nEasyEyes Remote Calibrator ${this.version.value}\n`,
      `color: ${this._CONST.COLOR.ORANGE}`,
    )

    this._initialized = false
    this._initializing = false

    this._id = null

    this._lang = null // A single string, e.g., 'en-US'
    this._langData = []

    this._panelStatus = {
      hasPanel: false,
      panelFinished: false,
      panelResolveIntervals: [],
    }
    this._panel = {
      panel: null,
      panelObserver: null,
      panelTasks: [],
      panelParent: null,
      panelOptions: {},
      panelCallback: null,
      panelResolve: null,
    }

    // Calibration check
    this._participantCheckEquipment = {
      has: null,
      equipment: null,
      unit: null,
    }

    // Are we calibrating for setting up gaze or distance tracking?
    this._trackingSetupFinishedStatus = {
      gaze: true,
      distance: true,
    }
    this._trackingPaused = {
      gaze: false,
      distance: false,
    }
    this._trackingVideoFrameTimestamps = {
      gaze: 0,
      distance: 0,
    }

    this._distanceTrackNudging = {
      distanceCorrecting: null, // setInterval
      distanceCorrectEnabled: false, // Whether to correct or not, used for endNudger
      distanceDesired: null,
      distanceAllowedRatio: null,
      needEasyEyesKeypadBeyondCm: null,
    }

    this._gazeTrackNudging = {
      isCorrectingGaze: false,
    }

    // ! DATA

    this._environmentData = []

    this._displayData = [] // Px
    this._screenData = [] // Cm
    this._viewingDistanceData = []
    this._nearPointData = []
    this._PDData = []

    this._gazePositionData = []
    this._gazeAccuracyData = []

    // Status
    this._performanceData = []
    this._fullscreenData = []

    // Check
    this._equipmentData = []
    this._checkData = []

    ////

    this._background = {
      element: null,
      instructionElement: null,
    }

    this._nudger = {
      element: null,
      gazeElement: null,
      nudgerPaused: false,
    }

    this._params = {
      backgroundColor: '#eee',
      videoOpacity: 0.8,
      showCancelButton: true,
    }

    // Function parameters
    this.viewingDistanceAllowedPreciseBool = true

    // ! Extensions
    this.keypadHandler = null
  }

  /* --------------------------------- GETTERS -------------------------------- */

  get background() {
    return this._background.element
  }

  get instructionElement() {
    return this._background.instructionElement
  }

  get nudger() {
    return this._nudger.element
  }

  // PARAMS

  get params() {
    return this._params
  }

  ////

  get id() {
    if (!this._id) return null
    return {
      value: this._id.value,
      timestamp: this._id.timestamp,
      date: this._id.date,
    }
  }

  /**
   * Help get a certain item from a given category
   */
  _helper_get(cat, name) {
    if (!cat.length) return null
    const thisData = cat[cat.length - 1]
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

  get supportedLanguages() {
    const a = []
    for (const l in phrases.EE_languageNameEnglish) {
      a.push({
        language: l,
        languageNameEnglish: phrases.EE_languageNameEnglish[l],
        languageNameNative: phrases.EE_languageNameNative[l],
      })
    }

    return a
  }

  get L() {
    return this._lang
  }

  get LD() {
    return this.languageDirection.value
  }

  get language() {
    return this._helper_get(this._langData, 'language')
  }

  get languageNameEnglish() {
    return this._helper_get(this._langData, 'languageNameEnglish')
  }

  get languageNameNative() {
    return this._helper_get(this._langData, 'languageNameNative')
  }

  get languageDirection() {
    return this._helper_get(this._langData, 'languageDirection')
  }

  get languagePhraseSource() {
    return this._helper_get(this._langData, 'languagePhraseSource')
  }

  // Status

  get computeArrayFillMHz() {
    return this._helper_get(this._performanceData, 'computeArrayFillMHz')
  }

  get computeRandomMHz() {
    return this._helper_get(this._performanceData, 'computeRandomMHz')
  }

  get idealFps() {
    return this._helper_get(this._performanceData, 'idealFps')
  }

  get stressFps() {
    return this._helper_get(this._performanceData, 'stressFps')
  }

  get isFullscreen() {
    if (
      !this.fullscreenData.length ||
      !isEqual(isFullscreen(), this._helper_get(this._fullscreenData).value)
    )
      this.newFullscreenData = {
        value: isFullscreen(),
        timestamp: performance.now(),
      }
    return this._helper_get(this._fullscreenData)
  }

  // Environment

  get concurrency() {
    return this._helper_get(this._environmentData, 'concurrency')
  }

  // get bot() {
  //   return this._helper_get(this._environmentData, 'bot')
  // }

  get browser() {
    return this._helper_get(this._environmentData, 'browser')
  }

  get browserVersion() {
    return this._helper_get(this._environmentData, 'browserVersion')
  }

  get deviceType() {
    return this._helper_get(this._environmentData, 'deviceType')
  }

  get isMobile() {
    const d = this._helper_get(this._environmentData, 'deviceType')
    return {
      value: d.value !== 'desktop',
      timestamp: d.timestamp,
    }
  }

  get model() {
    return this._helper_get(this._environmentData, 'model')
  }

  get manufacturer() {
    return this._helper_get(this._environmentData, 'manufacturer')
  }

  get engine() {
    return this._helper_get(this._environmentData, 'engine')
  }

  get system() {
    return this._helper_get(this._environmentData, 'system')
  }

  get systemFamily() {
    return this._helper_get(this._environmentData, 'systemFamily')
  }

  get description() {
    return this._helper_get(this._environmentData, 'description')
  }

  get fullDescription() {
    return this._helper_get(this._environmentData, 'fullDescription')
  }

  get userLanguage() {
    return this._helper_get(this._environmentData, 'userLanguage')
  }

  get equipment() {
    return this._helper_get(this._equipmentData)
  }

  // Screen

  get displayWidthPx() {
    this._displaySize()
    return this._helper_get(this._displayData, 'displayWidthPx')
  }

  get displayHeightPx() {
    this._displaySize()
    return this._helper_get(this._displayData, 'displayHeightPx')
  }

  get windowWidthPx() {
    this._displaySize()
    return this._helper_get(this._displayData, 'windowWidthPx')
  }

  get windowHeightPx() {
    this._displaySize()
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

  get performanceData() {
    return this._performanceData
  }

  get fullscreenData() {
    return this._fullscreenData
  }

  get environmentData() {
    return this._environmentData
  }

  get languageData() {
    return this._langData
  }

  get equipmentData() {
    return this._equipmentData
  }

  get checkData() {
    return this._checkData
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
   * @param {{ value: { idealFps: number; stressFps: number; }; timestamp: number; }} data
   */
  set newPerformanceData(data) {
    this._performanceData.push(data)
  }

  /**
   * @param {{ value: boolean; timestamp: Date; }} data
   */
  set newFullscreenData(data) {
    this._fullscreenData.push(data)
  }

  /**
   * @param {{ value: { language: string; languageNameEnglish: string; languageNameNative: string; languageDirection: string; languagePhraseSource: string; }; timestamp: Date; }} data
   */
  set newLanguageData(data) {
    this._langData.push(data)
  }

  /**
   * @param {{ value: { has: boolean; unit: string; equipment: string; }; timestamp: Date; }} data
   */
  set newEquipmentData(data) {
    this._equipmentData.push(data)
  }

  /**
   * @param {any} data
   */
  set newCheckData(data) {
    this._checkData.push(data)
  }
}

/**
 *
 * Must be called before any other functions
 *
 */
RemoteCalibrator.prototype.init = async function (
  initOptions = {},
  callback = undefined,
  extensions = {
    easyEyesKeypadHandler: null, // EasyEyes Keypad handler // { event_handlers: [], all_keys: [] } || null
  },
) {
  if (!this._initialized && !this._initializing) {
    this._initializing = true

    const options = Object.assign(
      {
        id: randomPhrases(),
        language: 'AUTO',
        languagePhrasesJSON: null,
        fullscreen: false,
      },
      initOptions,
    )

    // load internationalization phrases
    await loadPhrases(options.languagePhrasesJSON)

    if (options.fullscreen && !debug)
      await getFullscreen(this.language.value, this)

    this._id = {
      value: options.id,
      timestamp: performance.now(),
      date: new Date(), // only Date to save
    }

    this._environment(true)
    this._displaySize(true)

    if (this._CONST.S.AUTO === options.language)
      // AUTO
      this.newLanguageData = looseSetLanguage(this.userLanguage.value)
    else this.newLanguageData = looseSetLanguage(options.language)
    this._lang = this.language.value

    this._initializing = false
    this._initialized = true

    if (extensions?.easyEyesKeypadHandler) {
      this.keypadHandler = extensions.easyEyesKeypadHandler
      this.disableKeypadHandler = false //used to temporarily disable the keypad handler (e.g. during certain popups)
    }

    safeExecuteFunc(callback, this._id)
  }
}

/**
 *
 * Get the environment data, e.g. browser type
 *
 */
RemoteCalibrator.prototype._environment = function (forInit = false) {
  if (forInit || this.checkInitialized()) {
    blurAll()

    const isMobile = userAgent => {
      const mobile = userAgent.match(/Mobi/i)
      return mobile ? 'mobile' : 'desktop'
    }

    const data = {
      value: {
        concurrency: window.navigator.hardwareConcurrency || -1,
        // bot: bot
        //   ? `${bot.name} (${bot.category}) by ${bot.producer.name}`
        //   : null,
        browser: platform.name,
        browserVersion: platform.version,
        deviceType: isMobile(navigator.userAgent),
        // model: platform.product || device.device.model,
        model: platform.product || 'unknown',
        // manufacturer: platform.manufacturer || device.device.brand,
        manufacturer: platform.manufacturer || 'unknown',
        engine: platform.layout,
        // system: platform.os.toString(),
        system: `${platform.os.family} ${platform.os.version}`,
        systemFamily: platform.os.family,
        description: platform.description,
        fullDescription: platform.ua,
        userLanguage:
          window.navigator.userLanguage || window.navigator.language,
      },
      timestamp: this.id.timestamp,
    }

    this.newEnvironmentData = data
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
 * Remove keypad handler
 */
RemoteCalibrator.prototype.removeKeypadHandler = function () {
  if (this.keypadHandler) {
    clearAllHandlers_key_resp_allKeys(this.keypadHandler)
    this.keypadHandler = null
  }
}

/**
 * Get fullscreen
 * @param {Boolean} f Get fullscreen or not from options
 */
RemoteCalibrator.prototype.getFullscreen = async function (f = true) {
  try {
    if (isFullscreen()) {
      return true
    }

    this.newFullscreenData = {
      value:
        f && !debug
          ? await getFullscreen(this.language.value, this)
          : await getFullscreen(this.language.value, this),
      timestamp: performance.now(),
    }

    // Minimize address bar on mobile devices
    // ! Experimental
    if (this.isMobile.value) window.scrollBy(0, 1)
  } catch (e) {
    console.error(e)
  }

  return this.isFullscreen
}

/**
 * Set a new language
 */
RemoteCalibrator.prototype.newLanguage = function (lang) {
  if (this.checkInitialized()) {
    let data
    this.newLanguageData = data = looseSetLanguage(lang)
    this._lang = this.language.value
    return data
  }
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
    b.className = `calibration-background rc-lang-${this.LD.toLowerCase()}`

    document.body.classList.add('lock-view')
    document.body.appendChild(b)

    b.style.background = this.params.backgroundColor
  }

  if (inner) b.innerHTML = inner
  this._background.element = b

  return this.background
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
  const b = document.getElementById('calibration-background')
  if (b) {
    document.body.classList.remove('lock-view')
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
  shortDescription,
) {
  // Remove the old if there's any
  const ins = this.background.getElementsByClassName('calibration-instruction')

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
  id, // = null
  text,
) {
  if (this.background === null) this._addBackground()

  if (this.instructionElement !== null) {
    if (this.instructionElement.id === id) return

    // else
    this.background.removeChild(this.instructionElement)
    this._background.instructionElement = null
  }

  const instP = document.createElement('p')
  instP.className = 'float-instruction'
  instP.id = id || 'float-instruction'

  instP.innerHTML = replaceNewlinesWithBreaks(text) // Init
  this.background.appendChild(instP)

  this._background.instructionElement = instP
  return instP
}

RemoteCalibrator.prototype._setFloatInstructionElementPos = function (
  side,
  yOffset = 16,
) {
  // For blind spot test instructions
  const r = this.instructionElement.getBoundingClientRect()
  this.instructionElement.style.bottom = `calc(50% + ${yOffset + 10}px)`
  this.instructionElement.style.textAlign = 'left'
  // this.instructionElement.style.fontSize = '1.1em'
  if (side === 'left') {
    this.instructionElement.style.left = `max(10%, ${r.width / 2}px)`
    this.instructionElement.style.right = 'unset'
    this.instructionElement.style.transform = `translate(${-r.width / 2}px, 0)`
  } else if (side === 'right') {
    this.instructionElement.style.right = `max(10%, ${r.width / 2}px)`
    this.instructionElement.style.left = 'unset'
    this.instructionElement.style.transform = `translate(${r.width / 2}px, 0)`
  } else {
    // Reset to center
    this.instructionElement.style.left = '50%'
    this.instructionElement.style.right = 'unset'
    this.instructionElement.style.top = 'unset'
    this.instructionElement.style.transform = 'translate(-50%, 0)'
    this.instructionElement.style.textAlign = 'center'
  }
}

RemoteCalibrator.prototype._removeFloatInstructionElement = function () {
  if (this.instructionElement) {
    this.background.removeChild(this.instructionElement)
    this._background.instructionElement = null
    return this.background
  }
  return false
}

RemoteCalibrator.prototype._addCreditOnBackground = function (creditText) {
  if (this.background === null) this._addBackground()

  const p = document.createElement('p')
  p.className = 'calibration-credit-text'
  p.id = 'calibration-credit-text'
  p.innerHTML = creditText
  this.background.appendChild(p)

  return p
}

export default RemoteCalibrator
