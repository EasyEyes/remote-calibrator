import RemoteCalibrator from '../core'
import { takeInput } from '../components/input'
import { constructInstructions, safeExecuteFunc } from '../components/utils'

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName // 'measureDistance' OR 'trackDistance'
) {
  await this.getEquipment(() => {
    return checkDistance(this, distanceCallback, distanceData, measureName)
  })
}

const checkDistance = async (
  RC,
  distanceCallback,
  distanceData,
  measureName
) => {
  const isTrack = measureName === 'trackDistance'

  const quit = () => {
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData)
  }

  if (isTrack) safeExecuteFunc(distanceCallback, distanceData)

  if (RC.equipment && RC.equipment.value.has) {
    // ! Has equipment
    RC._replaceBackground(
      constructInstructions(
        '📏 ' + 'Measure Distance',
        'Measure the distance from your head to the screen, and type your numerical answer into the box, just the number. Then press OK.'
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
      console.log(newCheckData)
    }
  }
  quit()
}
