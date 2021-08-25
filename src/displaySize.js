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
      displayWidthPx: screen.width,
      displayHeightPx: screen.height,
      windowWidthPx: window.innerWidth,
      windowHeightPx: window.innerHeight,
    },
    timestamp: new Date(),
    // id: this.id.value
  }
  this.newDisplayData = thisData

  if (callback) callback(thisData)
}
