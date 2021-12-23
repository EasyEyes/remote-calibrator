import RemoteCalibrator from '../core'
import { takeInput } from '../components/checkInput'
import { constructInstructions, safeExecuteFunc } from '../components/utils'

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName, // 'measureDistance' OR 'trackDistance'
  checkCallback
) {
  await this.getEquipment(() => {
    return checkDistance(
      this,
      distanceCallback,
      distanceData,
      measureName,
      checkCallback
    )
  })
}

const checkDistance = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback
) => {
  const isTrack = measureName === 'trackDistance'

  const quit = () => {
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData)
  }

  // Start tracking right away
  if (isTrack) safeExecuteFunc(distanceCallback, distanceData)

  if (RC.equipment && RC.equipment.value.has) {
    // ! Has equipment
    RC._replaceBackground(
      constructInstructions(
        '📏 ' + 'Measure Viewing Distance with Your Own Tool',
        'Measure the distance from the midpoint of your eyes to the screen center, and type your numerical answer into the box, just the number. Then press OK.'
      )
    )

    const measureData = await takeInput(RC)

    if (measureData) {
      const measureValue = measureData.value
      const value = {
        ...measureValue,
        calibratorCm: RC.viewingDistanceCm.value,
        calibratorMethod: RC.viewingDistanceCm.method,
      }

      const newCheckData = {
        value: value,
        timestamp: measureData.timestamp,
        measure: measureName,
      }
      RC.newCheckData = newCheckData

      quit()
      safeExecuteFunc(checkCallback, newCheckData)

      return
    }
  }
  quit()
}
