import RemoteCalibrator from './core'
import { blurAll } from './helpers'

/**
 *
 * Get the display (and window) size
 *
 */
RemoteCalibrator.prototype.displaySize = function (callback) {
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  const thisData = {
    value: {
      displayWidthPX: screen.width,
      displayHeightPX: screen.height,
      windowWidthPX: window.innerWidth,
      windowHeightPX: window.innerHeight,
    },
    timestamp: new Date(),
    // id: this.id.value
  }
  this.displayData = thisData

  if (callback) callback(thisData)
}
