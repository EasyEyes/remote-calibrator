import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'
import { swalInfoOptions } from '../components/swalOptions'
import { safeExecuteFunc } from '../components/utils'

RemoteCalibrator.prototype.getEquipment = async function (
  afterResultCallback,
  forcedGet = false,
) {
  if (this.equipment && !forcedGet) return safeExecuteFunc(afterResultCallback)

  this._replaceBackground()
  const RC = this

  const { CM, IN_D, IN_F } = RC._CONST.UNITS
  const haveEquipmentOptions = {}
  haveEquipmentOptions[CM] = 'centimeter'
  haveEquipmentOptions[IN_D] = 'inch (decimal, e.g. 11.5 in)'
  haveEquipmentOptions[IN_F] = 'inch (fractional, e.g. 12 3/8 in)'

  const { value: result } = await Swal.fire({
    ...swalInfoOptions(RC, {
      showIcon: false,
    }),
    title: 'Do you have a ruler or tape measure?',
    html: `Ideally, it should be long enough to measure your viewing distance, but even a 6 inch (15 cm) ruler can be useful. Please select the units you'll use, or indicate that no ruler or tape measure is available.`,
    input: 'select',
    inputOptions: {
      ...haveEquipmentOptions,
      none: 'No ruler or tape measure is available',
    },
    inputPlaceholder: 'Select an option',
    // showCancelButton: true,
    inputValidator: value => {
      return new Promise(resolve => {
        if (!value.length) resolve('Please select an option.')

        const hasEquipment = value !== 'none'

        RC.newEquipmentData = {
          value: {
            has: hasEquipment,
            unit: hasEquipment ? value : null,
            equipment: hasEquipment ? '' : null,
          },
          timestamp: performance.now(),
        }

        resolve()
      })
    },
  })

  if (result) return safeExecuteFunc(afterResultCallback)
}
