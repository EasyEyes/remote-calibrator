import RemoteCalibrator from '../core'
import { constructInstructions, safeExecuteFunc } from '../components/utils'
import { takeInput } from '../components/input'

import Arrow from '../media/two-sided-horizontal.svg'

RemoteCalibrator.prototype._checkScreenSize = async function (
  screenSizeCallback,
  screenSizeData
) {
  await this.getEquipment(() => {
    checkScreenSize(this, screenSizeCallback, screenSizeData)
  })
}

const checkScreenSize = async (RC, screenSizeCallback, screenSizeData) => {
  const quit = () => {
    RC._removeBackground()
    safeExecuteFunc(screenSizeCallback, screenSizeData)
  }

  if (RC.equipment && RC.equipment.value.has) {
    // ! Has equipment
    RC._replaceBackground(
      constructInstructions(
        '📏 ' + 'Measure Size',
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
      const calibratorIn = arrowWidthPx / RC.screenPpi.value

      const value = {
        ...measureValue,
        calibratorIn: calibratorIn,
      }

      const newCheckData = {
        value: value,
        timestamp: measureData.timestamp,
        measure: 'screenSize',
      }
      RC.newCheckData = newCheckData
      console.log(newCheckData)
    }
  }
  quit()
}
