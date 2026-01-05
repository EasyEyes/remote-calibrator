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

    // Panel state tracking
    this._panelState = null

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

  /**
   * Get the current panel state (for tracking task progress)
   */
  get panelState() {
    return this._panelState
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
 * Return to panel for screen size calibration when viewing distance exceeds range
 * This method resets the panel to allow the user to recalibrate screen size
 */
RemoteCalibrator.prototype._returnToPanelForScreenSize = function () {
  if (!this._panelStatus.hasPanel) {
    console.warn('Cannot return to panel - no panel is currently active')
    return
  }

  // Clean up any current calibration state thoroughly
  this._removeBackground()
  this._removeFloatInstructionElement()

  // End any active distance tracking
  if (
    this.gazeTracker &&
    this.gazeTracker.checkInitialized('distance', false)
  ) {
    this.endDistance()
  }

  // Clean up any remaining DOM elements from distance calibration
  this._cleanupDistanceCalibrationElements()

  // Remove any global event listeners that might be left from distance tests
  this._removeGlobalDistanceEventListeners()

  // Reset panel to screen size step
  // Find the index of the screenSize task
  const tasks = this._panel.panelTasks
  let screenSizeIndex = -1

  for (let i = 0; i < tasks.length; i++) {
    const taskName = typeof tasks[i] === 'string' ? tasks[i] : tasks[i].name
    if (taskName === 'screenSize') {
      screenSizeIndex = i
      break
    }
  }

  if (screenSizeIndex === -1) {
    console.warn('Screen size task not found in panel tasks')
    return
  }

  // Reset panel to activate screen size step
  this._resetPanelToStep(screenSizeIndex)
}

/**
 * Reset panel to a specific step index
 * @param {number} stepIndex - The index of the step to activate
 */
RemoteCalibrator.prototype._resetPanelToStep = function (stepIndex) {
  if (!this._panelStatus.hasPanel) {
    console.warn('Cannot reset panel - no panel is currently active')
    return
  }

  const tasks = this._panel.panelTasks
  const options = this._panel.panelOptions
  const finalCallback = this._panel.panelCallback

  // Create a current state object that matches the panel's internal structure
  const current = { index: stepIndex, finished: [] }

  // Mark all previous steps as finished
  for (let i = 0; i < stepIndex; i++) {
    current.finished.push(
      typeof tasks[i] === 'string' ? tasks[i] : tasks[i].name,
    )
  }

  // Reset step visual states
  document.querySelectorAll('.rc-panel-step').forEach((e, ind) => {
    const eIndex = Number(e.dataset.index)

    // Remove all step state classes
    e.classList.remove(
      'rc-panel-step-active',
      'rc-panel-step-inactive',
      'rc-panel-step-finished',
      'rc-panel-step-todo',
    )

    if (eIndex < stepIndex) {
      // Mark previous steps as todo (so they can be re-run if needed)
      e.classList.add('rc-panel-step-todo', 'rc-panel-step-inactive')
    } else if (eIndex === stepIndex) {
      // Mark current step as todo and make it active
      e.classList.add('rc-panel-step-todo', 'rc-panel-step-active')
    } else {
      // Mark future steps as todo and inactive
      e.classList.add('rc-panel-step-todo', 'rc-panel-step-inactive')
    }
  })

  // Reactivate the target step using the panel's internal activation function
  // We need to access the internal _activateStepAt function from panel.js
  this._activateStepAt(current, tasks, options, finalCallback)
}

/**
 * Internal method to activate a step (this duplicates the logic from panel.js)
 * @param {object} current - Current panel state
 * @param {array} tasks - Panel tasks
 * @param {object} options - Panel options
 * @param {function} finalCallback - Final callback
 */
RemoteCalibrator.prototype._activateStepAt = function (
  current,
  tasks,
  options,
  finalCallback,
) {
  document.querySelectorAll('.rc-panel-step').forEach((e, ind) => {
    const eIndex = Number(e.dataset.index)

    if (eIndex === current.index) {
      e.classList.replace('rc-panel-step-inactive', 'rc-panel-step-active')
      e.focus()

      if (eIndex !== tasks.length) {
        if (eIndex === tasks.length - 1 && !options.showNextButton) {
          // Last task without next button
          e.onclick = () => {
            const taskName =
              typeof tasks[current.index] === 'string'
                ? tasks[current.index]
                : tasks[current.index].name
            this[taskName](
              ...this._getTaskOptionsCallbacks(
                tasks[current.index],
                // Fixed task callback
                () => {
                  this._finishStepAt(current.index)
                },
                finalCallback,
                // Fixed final callback
                () => {
                  this._panelStatus.panelFinished = true
                },
              ),
            )
          }
        } else {
          // Interim tasks
          e.onclick = () => {
            const taskName =
              typeof tasks[current.index] === 'string'
                ? tasks[current.index]
                : tasks[current.index].name
            this[taskName](
              ...this._getTaskOptionsCallbacks(
                tasks[current.index],
                // Fixed task callback
                () => {
                  this._finishStepAt(current.index)
                  current.index++
                  this._activateStepAt(current, tasks, options, finalCallback)
                },
              ),
            )
          }
        }
      }
    }
  })
}

/**
 * Mark a step as finished (duplicates logic from panel.js)
 * @param {number} index - Step index to finish
 */
RemoteCalibrator.prototype._finishStepAt = function (index) {
  const steps = document.querySelectorAll('.rc-panel-step')

  for (const e of steps) {
    if (Number(e.dataset.index) === index) {
      e.classList.replace('rc-panel-step-todo', 'rc-panel-step-finished')
      e.classList.replace('rc-panel-step-active', 'rc-panel-step-inactive')
    }
  }
}

/**
 * Get task options and callbacks (duplicates logic from panel.js)
 * @param {object|string} task - Task definition
 * @param {function} fixedTaskCallback - Fixed task callback
 * @param {function} finalCallback - Final callback
 * @param {function} fixedFinalCallback - Fixed final callback
 */
RemoteCalibrator.prototype._getTaskOptionsCallbacks = function (
  task,
  fixedTaskCallback,
  finalCallback = null,
  fixedFinalCallback = null,
) {
  if (typeof task === 'string')
    task = {
      name: task,
    }

  const getFinalCallbacks = () => {
    // Task
    if (fixedTaskCallback) fixedTaskCallback()
    // Panel
    if (finalCallback) finalCallback({ timestamp: performance.now() })
    if (fixedFinalCallback) fixedFinalCallback()
  }

  if (['screenSize', 'measureDistance', 'performance'].includes(task.name)) {
    return [
      task.options || {},
      data => {
        if (task.callback) task.callback(data)
        getFinalCallbacks()
      },
    ]
  }

  if ('trackGaze' === task.name) {
    return [
      task.options || {},
      data => {
        if (task.callbackOnCalibrationEnd) task.callbackOnCalibrationEnd(data)
        getFinalCallbacks()
      },
      task.callbackTrack || null,
    ]
  }

  if ('trackDistance' === task.name) {
    return [
      task.options || {},
      data => {
        if (task.callbackStatic) task.callbackStatic(data)
        getFinalCallbacks()
      },
      task.callbackTrack || null,
    ]
  }
}

/**
 * Clean up any remaining DOM elements from distance calibration
 * This prevents null reference errors when switching back to panel
 */
RemoteCalibrator.prototype._cleanupDistanceCalibrationElements = function () {
  // Remove any floating instruction elements
  const floatInstructions = document.querySelectorAll('.float-instruction')
  floatInstructions.forEach(element => {
    if (element.parentNode) {
      element.parentNode.removeChild(element)
    }
  })

  // Remove blind spot canvas and related elements
  const blindSpotCanvas = document.querySelector('#blind-spot-canvas')
  if (blindSpotCanvas && blindSpotCanvas.parentNode) {
    blindSpotCanvas.parentNode.removeChild(blindSpotCanvas)
  }

  // Remove blind spot instruction
  const blindSpotInstruction = document.querySelector('#blind-spot-instruction')
  if (blindSpotInstruction && blindSpotInstruction.parentNode) {
    blindSpotInstruction.parentNode.removeChild(blindSpotInstruction)
  }

  // Remove any object test containers
  const objectTestContainers = document.querySelectorAll('[id*="object-test"]')
  objectTestContainers.forEach(element => {
    if (element.parentNode) {
      element.parentNode.removeChild(element)
    }
  })

  // Remove buttons container
  const buttonContainer = document.querySelector('.rc-button-container')
  if (buttonContainer && buttonContainer.parentNode) {
    buttonContainer.parentNode.removeChild(buttonContainer)
  }

  // Reset instruction element reference to null to prevent getBoundingClientRect errors
  if (this._background) {
    this._background.instructionElement = null
  }

  // Note: We don't aggressively clear all intervals as that could interfere
  // with other parts of the application. Specific interval cleanup should
  // be handled by the individual calibration methods.
}

/**
 * Remove global event listeners that might be left from distance tests
 */
RemoteCalibrator.prototype._removeGlobalDistanceEventListeners = function () {
  // Remove keydown and keyup listeners that might be from distance tests
  // Note: We can't remove ALL listeners as that would break other functionality
  // Instead, we'll create a more targeted approach by storing references

  // Remove common distance test event listeners
  const eventsToClean = [
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'mousemove',
    'touchstart',
    'touchend',
    'touchmove',
  ]

  eventsToClean.forEach(eventType => {
    // Clone the node to remove all event listeners of this type
    // This is a brute-force approach but effective for cleanup
    const elements = document.querySelectorAll('canvas, div, button')
    elements.forEach(element => {
      if (
        element.id &&
        (element.id.includes('blind-spot') ||
          element.id.includes('object-test'))
      ) {
        const clone = element.cloneNode(true)
        if (element.parentNode) {
          element.parentNode.replaceChild(clone, element)
        }
      }
    })
  })

  // Remove any resize observers that might be left
  try {
    // This is a more gentle approach - just stop observing if observers exist
    if (window.ResizeObserver) {
      const elements = document.querySelectorAll('[data-observed]')
      elements.forEach(element => {
        element.removeAttribute('data-observed')
      })
    }
  } catch (e) {
    // Ignore errors in cleanup
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
  // Safety check to prevent null reference errors
  if (!this.instructionElement) {
    console.warn('Cannot set instruction element position - element is null')
    return
  }

  const el = this.instructionElement

  // Place slightly lower than previous and align using top so both sides share the same top edge
  el.style.top = `calc(15% + ${yOffset + 10}px)`
  el.style.bottom = 'unset'

  // Constrain to half-screen and avoid crossing midline
  el.style.maxWidth = '50vw'
  el.style.width = '50vw'
  el.style.textAlign = 'left'
  el.style.transform = 'translate(0, 0)'

  if (side === 'left') {
    // Left half: from left edge to midline
    el.style.left = '0'
    el.style.right = '50vw'
  } else if (side === 'right') {
    // Right half: from midline to right edge
    el.style.left = '50vw'
    el.style.right = '0'
  } else {
    // Fallback: center but still constrained to half width
    el.style.left = '25vw'
    el.style.right = '25vw'
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
