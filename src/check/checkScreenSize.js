import RemoteCalibrator from '../core'
import {
  constructInstructions,
  safeExecuteFunc,
  toFixedNumber,
} from '../components/utils'
import { takeInput } from '../components/checkInput'

import ArrowHorizontal from '../media/two-sided-horizontal.svg'
import ArrowVertical from '../media/two-sided-vertical.svg'

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

    const getInputFunctions = arrowSvg => {
      return [
        () => {
          // extraFunction for Arrow
          const arrow = document.createElement('div')
          RC.background.appendChild(arrow)
          arrow.outerHTML = arrowSvg
        },
        () => {
          // extraFunctionOut
          for (let ele of RC.background.getElementsByClassName(
            'arrow-two-sided-svg'
          )) {
            ele.remove()
          }
        },
        {
          callback: () => {},
          content: 'Ruler is too short',
        },
      ]
    }

    const measureWidthData = await takeInput(
      RC,
      ...getInputFunctions(ArrowHorizontal)
    )

    const measureHeightData = await takeInput(
      RC,
      ...getInputFunctions(ArrowVertical)
    )

    const value = {}

    if (measureWidthData) {
      const measureValue = measureWidthData.value

      const arrowWidthPx = RC.windowWidthPx.value
      const calibratorCm = toFixedNumber(
        (2.54 * arrowWidthPx) / RC.screenPpi.value,
        1
      )

      value.horizontal = {
        ...measureValue,
        calibratorArrowWidthCm: calibratorCm,
        arrowWidthPx: arrowWidthPx,
      }
    }

    if (measureHeightData) {
      const measureValue = measureHeightData.value

      const arrowHeightPx = RC.windowHeightPx.value
      const calibratorCm = toFixedNumber(
        (2.54 * arrowHeightPx) / RC.screenPpi.value,
        1
      )

      value.vertical = {
        ...measureValue,
        calibratorArrowHeightCm: calibratorCm,
        arrowHeightPx: arrowHeightPx,
      }
    }

    if (value.vertical || value.horizontal) {
      const newCheckData = {
        value: value,
        timestamp: measureWidthData.timestamp,
        measure: 'screenSize',
      }

      RC.newCheckData = newCheckData

      safeExecuteFunc(checkCallback, newCheckData)
    }
  }
  quit()
  return
}
