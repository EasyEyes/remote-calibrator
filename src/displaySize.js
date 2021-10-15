import isEqual from 'react-fast-compare'

import RemoteCalibrator from './core'
import { blurAll } from './components/utils'

/**
 *
 * Get the display (and window) size
 *
 */
RemoteCalibrator.prototype._displaySize = function () {
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
  }

  if (
    !this.displayData.length ||
    !isEqual(
      thisData.value,
      this.displayData[this.displayData.length - 1].value
    )
  )
    this.newDisplayData = thisData
}
