import RemoteCalibrator from '../core'
import {
  constructInstructions,
  safeExecuteFunc,
  toFixedNumber,
} from '../components/utils'
import { takeInput } from '../components/checkInput'

import Arrow from '../media/two-sided-horizontal.svg'

RemoteCalibrator.prototype._checkScreenSize = async function (
  screenSizeCallback,
  screenSizeData,
  checkCallback
) {
  await this.getEquipment(() => {
    checkScreenSize(this, screenSizeCallback, screenSizeData, checkCallback)
  })
}

const checkScreenSize = async (
  RC,
  screenSizeCallback,
  screenSizeData,
  checkCallback
) => {
  const quit = () => {
    RC._removeBackground()
    safeExecuteFunc(screenSizeCallback, screenSizeData)
  }

  if (RC.equipment && RC.equipment.value.has) {
    // ! Has equipment
    RC._replaceBackground(
      constructInstructions(
        '📏 ' + 'Measure the Length of the Arrow',
        'Use your ruler (or tape measure) to measure the length of the arrow. Type your numerical answer into the box. Just digits, period, decimal comma, and <span style="font-family: Courier, monospace;">/</span> (forward slash) for fractional inches. Then click OK or hit RETURN.'
      )
    )

    const measureData = await takeInput(
      RC,
      () => {
        // extraFunction for Arrow
        const arrow = document.createElement('div')
        RC.background.appendChild(arrow)
        arrow.outerHTML = Arrow
      },
      {
        callback: () => {},
        content: 'Ruler is too short',
      }
    )

    if (measureData) {
      const measureValue = measureData.value

      const arrowWidthPx = RC.windowWidthPx.value
      const calibratorCm = toFixedNumber(
        (2.54 * arrowWidthPx) / RC.screenPpi.value,
        1
      )

      const value = {
        ...measureValue,
        calibratorCm: calibratorCm,
        arrowLengthPx: window.innerWidth,
      }

      const newCheckData = {
        value: value,
        timestamp: measureData.timestamp,
        measure: 'screenSize',
      }
      RC.newCheckData = newCheckData

      safeExecuteFunc(checkCallback, newCheckData)
    }
  }
  quit()
  return
}
