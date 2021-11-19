import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'
import { swalInfoOptions } from '../components/swalOptions'
import { constructInstructions, safeExecuteFunc } from '../components/utils'
import { takeInput } from '../components/input'

RemoteCalibrator.prototype._checkScreenSize = async function (
  screenSizeCallback,
  screenSizeData
) {
  const RC = this
  this._addBackground()

  if (this.equipment) {
    // Asked
    checkScreenSize(this, screenSizeCallback, screenSizeData)
    ////
  } else {
    const { CM, IN_D, IN_F } = RC._CONST.UNITS
    const haveEquipmentOptions = {}
    haveEquipmentOptions[CM] = 'cm'
    haveEquipmentOptions[IN_D] = 'in (Decimal, e.g. 11.5 in)'
    haveEquipmentOptions[IN_F] = 'in (Fractional, e.g. 12 3/16 in)'

    const { value: result } = await Swal.fire({
      ...swalInfoOptions(RC, {
        showIcon: false,
      }),
      title: 'Check the calibration',
      input: 'select',
      inputOptions: {
        'I have an appropriate measuring device in units': haveEquipmentOptions,
        "I don't have an appropriate measuring device": {
          none: 'No device',
        },
      },
      inputPlaceholder: 'Select an option',
      // showCancelButton: true,
      inputValidator: value => {
        return new Promise(resolve => {
          const hasEquipment = value !== 'none'

          RC.newEquipmentData = {
            value: {
              has: hasEquipment,
              unit: hasEquipment ? value : null,
              equipment: hasEquipment ? '' : null,
            },
            timestamp: new Date(),
          }

          resolve()
        })
      },
    })

    if (result) checkScreenSize(this, screenSizeCallback, screenSizeData)
  }
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
        '📏 ' + 'Check Screen Size Measure',
        'Measure the length of the arrow, and put your answer in the text box. You only need to put the numbers. When finished, press OK.'
      )
    )

    const input = await takeInput(RC)

    if (input) {
      window.console.log(input)
    }
  }
  quit()
}
