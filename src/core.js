/**
 *
 * The fundamental functions, e.g. init
 *
 */

import randomPhrases from './components/randomPhrases'
import { debug } from './constants'
import { getFullscreen } from './helpers'

class RemoteCalibrator {
  constructor() {
    this._initialized = false

    this._id = null
    this._displayData = []
    this._screenData = []
    this._viewingDistanceData = []
    this._gazePositionData = []
  }

  /* --------------------------------- GETTERS -------------------------------- */

  get id() {
    return this._id
  }

  /**
   * Help get a certain item from a given category
   */
  _helper_get(cat, name) {
    if (!cat.length) return null
    let thisData = cat[cat.length - 1]
    return name
      ? { value: thisData[name], timestamp: thisData.timestamp }
      : thisData
  }

  // Screen

  get displayWidthPX() {
    return this._helper_get(this._displayData, 'displayWidthPX')
  }

  get displayHeightPX() {
    return this._helper_get(this._displayData, 'displayHeightPX')
  }

  get windowWidthPX() {
    return this._helper_get(this._displayData, 'windowWidthPX')
  }

  get windowHeightPX() {
    return this._helper_get(this._displayData, 'windowHeightPX')
  }

  get screenWidthCM() {
    return this._helper_get(this._screenData, 'screenWidthCM')
  }

  get screenHeightCM() {
    return this._helper_get(this._screenData, 'screenHeightCM')
  }

  get screenDiagonalCM() {
    return this._helper_get(this._screenData, 'screenDiagonalCM')
  }

  get screenDiagonalIN() {
    return this._helper_get(this._screenData, 'screenDiagonalIN')
  }

  get screenPPI() {
    return this._helper_get(this._screenData, 'screenPPI')
  }

  get screenPhysicalPPI() {
    return this._helper_get(this._screenData, 'screenPhysicalPPI')
  }

  // Distance

  get viewingDistanceCM() {
    return this._helper_get(this._viewingDistanceData)
  }

  // Gaze

  get gazePositionPX() {
    return this._helper_get(this._gazePositionData)
  }

  /* --------------------------------- SETTERS -------------------------------- */

  /**
   * @param {{ displayWidthPX: number; displayHeightPX: number; windowWidthPX: number; windowHeightPX: number; timestamp: Date; }} data
   */
  set displayData(data) {
    this._displayData.push(data)
  }

  /**
   * @param {{ screenWidthCM: number; screenHeightCM: number; screenDiagonalCM: number; screenDiagonalIN: number; screenPPI: number; screenPhysicalPPI: number; timestamp: Date; }} data
   */
  set screenData(data) {
    this._screenData.push(data)
  }

  /**
   * @param {{ value: number; timestamp: Date; }} data
   */
  set viewingDistanceData(data) {
    this._viewingDistanceData.push(data)
  }

  /**
   * @param {{ x: number; y: number; timestamp: Date; }} data
   */
  set gazePositionData(data) {
    this._gazePositionData.push(data)
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
        fullscreen: true,
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
 * Check if RemoteCalibrator is initialized
 *
 */
RemoteCalibrator.prototype.checkInitialized = function () {
  if (this._initialized) return true
  console.error('RemoteCalibrator is not initialized.')
  return false
}

export default RemoteCalibrator
