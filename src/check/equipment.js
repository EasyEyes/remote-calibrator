import Swal from 'sweetalert2'

import RemoteCalibrator from '../core'
import { swalInfoOptions } from '../components/swalOptions'
import { safeExecuteFunc } from '../components/utils'
import { phrases } from '../i18n/schema'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'

RemoteCalibrator.prototype.getEquipment = async function (
  afterResultCallback,
  forcedGet = false,
  version = 'original',
) {
  if (this.equipment && !forcedGet) return safeExecuteFunc(afterResultCallback)

  this._replaceBackground()

  let title, html

  if (version === 'original') {
    title = 'Do you have a ruler or tape measure?'
    html = `
      <p>
        Ideally, it should be long enough to measure your viewing distance, but even a 6 inch (15 cm) ruler can be useful. 
        Please select the units you'll use, or indicate that no ruler or tape measure is available.
      </p>
      <div id="custom-radio-group">
        <label>
          <input type="radio" name="equipment" value="cm" />
          Centimeter
        </label>
        <label>
          <input type="radio" name="equipment" value="inches" />
          Inch (decimal, e.g. 11.5 in)
        </label>
        <label>
          <input type="radio" name="equipment" value="none" />
          No ruler or tape measure is available
        </label>
      </div>
    `
  } else {
    title = `<h1 style=text-align:justify>${remoteCalibratorPhrases.RC_TestDistances[
      this.language.value
    ].replace(/(?:\r\n|\r|\n)/g, '<br>')}<h1/>`
    html = `
      <p>${remoteCalibratorPhrases.RC_rulerUnit[this.language.value].replace(/(?:\r\n|\r|\n)/g, '<br>')}</p>
      <div id="custom-radio-group">
        <label>
          <input class="custom-input-class"  type="radio" name="equipment" value="inches" />
          Inches
        </label>
        <label>
          <input class="custom-input-class"  type="radio" name="equipment" value="cm" />
          Centimeters
        </label>
        <label>
          <input class="custom-input-class"  type="radio" name="equipment" value="none" />
          None
        </label>
      </div>
    `
  }

  const { value: result } = await Swal.fire({
    ...swalInfoOptions(this, {
      showIcon: false,
    }),
    title,
    html,
    preConfirm: () => {
      const selected = document.querySelector('input[name="equipment"]:checked')
      if (!selected) {
        Swal.showValidationMessage('Please select an option.')
        return null
      }
      return selected.value
    },
    didOpen: () => {
      document.querySelector('input[name="equipment"][value="none"]').checked =
        true

      const customInputs = document.querySelectorAll('.custom-input-class')
      const keydownListener = event => {
        if (event.key === 'Enter') {
          Swal.clickConfirm() // Simulate the "OK" button click
        }
      }

      customInputs.forEach(input => {
        input.addEventListener('keyup', keydownListener)
      })

      if (this.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          this.keypadHandler,
          () => {
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
        )
      }

      // Store listeners for cleanup
      this.customKeydownListener = keydownListener
      this.customInputs = customInputs
    },
    willClose: () => {
      // Remove keydown event listeners when the modal closes
      if (this.customInputs) {
        this.customInputs.forEach(input => {
          input.removeEventListener('keyup', this.customKeydownListener)
        })
      }
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
    title:
      '<h1 style=text-align:justify>' +
      remoteCalibratorPhrases.RC_howLong[RC.language.value].replace(
        'AAA',
        data.value.unit,
      ) +
      '</h1>',
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
        console.log('value', value)
        RC.rulerLength = value
        data.value.length = value
        RC.newEquipmentData = data
        resolve() // Valid input
      })
    },
    didOpen: () => {
      const swalInput = Swal.getInput()
      const keydownListener = event => {
        if (event.key === 'Enter') {
          Swal.clickConfirm()
        }
      }

      if (swalInput) {
        swalInput.addEventListener('keyup', keydownListener)
      }

      if (RC.keypadHandler) {
        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            removeKeypadHandler()
            Swal.clickConfirm()
          },
          false,
          ['return'],
        )
      }

      // Store listener for cleanup
      RC.swalKeydownListener = keydownListener
    },
    willClose: () => {
      // Remove keydown event listener
      const swalInput = Swal.getInput()
      if (swalInput && RC.swalKeydownListener) {
        swalInput.removeEventListener('keydown', RC.swalKeydownListener)
      }
    },
  })

  return result
}
