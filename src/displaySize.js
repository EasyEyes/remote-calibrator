import RemoteCalibrator from './core'

/**
 *
 * Get the display (and window) size
 *
 */
RemoteCalibrator.prototype.displaySize = function (callback) {
  if (!this.checkInitialized()) return

  const thisData = {
    displayWidthPX: window.screen.width,
    displayHeightPX: window.screen.height,
    windowWidthPX: window.innerWidth,
    windowHeightPX: window.innerHeight,
    timestamp: new Date(),
    // id: this.id.value
  }
  this.displayData = thisData

  if (callback) callback(thisData)
}
