import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'
import { swalInfoOptions } from '../components/swalOptions'
import { safeExecuteFunc } from '../components/utils'
import { phrases } from '../i18n/schema'
import { remoteCalibratorPhrases } from '../i18n/phrases'

RemoteCalibrator.prototype.getEquipment = async function (
  afterResultCallback,
  forcedGet = false,
  version = 'original',
) {
  if (this.equipment && !forcedGet) return safeExecuteFunc(afterResultCallback)

  this._replaceBackground()

  let title, html, inputType, inputOptions, inputPlaceholder, inputValue

  if (version === 'original') {
    const { CM, IN_D, IN_F } = this._CONST.UNITS
    const haveEquipmentOptions = {
      [CM]: 'centimeter',
      [IN_D]: 'inch (decimal, e.g. 11.5 in)',
      [IN_F]: 'inch (fractional, e.g. 12 3/8 in)',
      none: 'No ruler or tape measure is available',
    }

    title = 'Do you have a ruler or tape measure?'
    html = `Ideally, it should be long enough to measure your viewing distance, but even a 6 inch (15 cm) ruler can be useful. Please select the units you'll use, or indicate that no ruler or tape measure is available.`
    inputType = 'select'
    inputOptions = haveEquipmentOptions
    inputPlaceholder = 'Select an option'
    inputValue = undefined
  } else {
    // replace newlines with <br />
    title = remoteCalibratorPhrases.RC_TestDistances[
      this.language.value
    ].replace(/(?:\r\n|\r|\n)/g, '<br>')
    html = remoteCalibratorPhrases.RC_rulerUnit[this.language.value].replace(
      /(?:\r\n|\r|\n)/g,
      '<br>',
    )
    inputType = 'radio'
    inputOptions = {
      inches: 'inches',
      cm: 'cm',
      none: 'None',
    }
    inputPlaceholder = undefined
    inputValue = 'none'
  }

  const { value: result } = await Swal.fire({
    ...swalInfoOptions(this, {
      showIcon: false,
    }),
    title,
    html,
    input: inputType,
    inputOptions,
    inputPlaceholder,
    inputValue,
    inputValidator: value => {
      return new Promise(resolve => {
        if (!value?.length) {
          resolve('Please select an option.')
        }
        this.rulerUnits = value
        resolve() // Valid input
      })
    },
  })

  if (!result) return

  const hasEquipment = result !== 'none'

  const data = {
    value: {
      has: hasEquipment,
      unit: hasEquipment ? result : null,
      equipment: hasEquipment ? '' : null,
      length: hasEquipment ? '' : null,
    },
    timestamp: performance.now(),
  }

  if (version !== 'original' && hasEquipment) {
    await getEquipmentDetails(this, data)
  } else {
    this.newEquipmentData = data
  }

  return safeExecuteFunc(afterResultCallback)
}

const getEquipmentDetails = async (RC, data) => {
  const { value: result } = await Swal.fire({
    ...swalInfoOptions(RC, {
      showIcon: false,
    }),
    title: remoteCalibratorPhrases.RC_howLong[RC.language.value].replace(
      'AAA',
      data.value.unit,
    ),
    input: 'number',
    inputAttributes: {
      min: 0,
      step: 1,
    },
    inputPlaceholder: '',
    inputValidator: value => {
      return new Promise(resolve => {
        if (!value?.length || isNaN(value) || parseInt(value) <= 0) {
          resolve(
            'Please provide a number for the length of your ruler or tape measure.',
          )
        }
        RC.rulerLength = value
        data.value.length = value
        RC.newEquipmentData = data
        resolve() // Valid input
      })
    },
  })

  return result
}
