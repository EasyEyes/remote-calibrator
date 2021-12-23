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
        '📏 ' + 'Measure Size with Your Own Tool',
        'Measure the length of the arrow, and type your numerical answer into the box, just the number. Then press OK.'
      )
    )

    const measureData = await takeInput(RC, () => {
      // extraFunction for Arrow
      const arrow = document.createElement('div')
      RC.background.appendChild(arrow)
      arrow.outerHTML = Arrow
    })

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

      quit()
      safeExecuteFunc(checkCallback, newCheckData)

      return
    }
  }
  quit()
}
