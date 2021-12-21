import { addButtons } from './buttons'

import { bindKeys, unbindKeys } from './keyBinder'
import { safeExecuteFunc } from './utils'

// const _exampleMeasure = {
//   cm: '22.5',
//   inDecimal: '11.5',
//   inFractional: ['12', '3/16'],
// }

export const takeInput = async (RC, extraFunction = null) => {
  const unit = RC.equipment.value.unit
  const unitDisplay = unit === RC._CONST.UNITS.CM ? 'cm' : 'in'
  const unitIsFraction = unit === RC._CONST.UNITS.IN_F

  // ! Elements
  const formItem = `<div class="rc-form">
  <div class="rc-form-inputs">
  ${
    unitIsFraction
      ? `<input type="text" class="rc-form-input rc-form-input-f-integer" placeholder="integer" /><input type="text" class="rc-form-input rc-form-input-f-fraction" placeholder="fraction" /><span>${unitDisplay}</span>`
      : `<input type="text" class="rc-form-input" /><span>${unitDisplay}</span>`
    // : `<input type="text" class="rc-form-input" placeholder="Your measure, e.g. ${_exampleMeasure[unit]}" /><span>${unitDisplay}</span>`
  }
  </div>
</div>`

  const instruction = RC.background.querySelector('.calibration-instruction')
  instruction.innerHTML += formItem
  const formElement = instruction.querySelector('.rc-form')
  const formInputElement = instruction.querySelector('.rc-form-input')
  const formInputElementFInteger = instruction.querySelector(
    '.rc-form-input-f-integer'
  )
  const formInputElementFFraction = instruction.querySelector(
    '.rc-form-input-f-fraction'
  )
  // const formSubmitElement = instruction.querySelector('.rc-form-submit')

  // Focus on input element
  unitIsFraction ? formInputElementFInteger.focus() : formInputElement.focus()

  const addedButtons = addButtons(
    RC.L,
    formElement,
    {
      go: () => {},
      // cancel: () => {},
    },
    true,
    false
  )
  const goButton = addedButtons[1]
  // const cancelButton = addedButtons[2]
  goButton.disabled = true

  // ! oninput
  const eleOkay = ele => {
    ele.classList.remove('rc-input-error')
    goButton.disabled = false
  }
  const eleError = ele => {
    ele.classList.add('rc-input-error')
    goButton.disabled = true
  }
  const setupEleOninput = (ele, validationFunction) => {
    ele.oninput = () => {
      if (validationFunction(ele.value)) eleOkay(ele)
      else eleError(ele)
    }
  }
  if (!unitIsFraction) setupEleOninput(formInputElement, validInput)
  else {
    setupEleOninput(formInputElementFInteger, validInputInteger)
    setupEleOninput(formInputElementFFraction, validInputFraction)
  }

  // ! Arrow, etc.
  safeExecuteFunc(extraFunction)

  // ! Finish
  return new Promise(resolve => {
    // const bFunction = () => {
    //   unbindKeys(bindKeysFunction)
    //   resolve(null)
    // }
    const fFunction = () => {
      let valid = false
      let numericalValue, inputValue
      if (
        unitIsFraction &&
        validInputInteger(formInputElementFInteger.value) &&
        validInputFraction(formInputElementFFraction.value)
      ) {
        valid = true
        numericalValue =
          parseInt(formInputElementFInteger.value) +
          eval(formInputElementFFraction.value)
        inputValue =
          formInputElementFInteger.value + ' ' + formInputElementFFraction.value
      } else if (!unitIsFraction && validInput(formInputElement.value)) {
        valid = true
        numericalValue = Number(formInputElement.value)
        inputValue = formInputElement.value
      }

      if (valid) {
        unbindKeys(bindKeysFunction)
        resolve({
          value: {
            numerical: numericalValue, // Parsed numerical
            input: inputValue, // Original input
            unit: unit,
          },
          timestamp: new Date(),
        })
      }
    }

    // Bind buttons
    goButton.onclick = fFunction
    // cancelButton.onclick = bFunction

    // Bind keys
    const bindKeysFunction = bindKeys({
      // Escape: bFunction,
      Enter: fFunction,
    })
  })
}

/* -------------------------------------------------------------------------- */

const validInput = text => {
  return text.length > 0 && !isNaN(text) && !text.includes(' ')
}

const validInputInteger = text => {
  if (!validInput(text)) return false
  return parseInt(text) === Number(text)
}

const validInputFraction = text => {
  if (text === '0') return true
  if (!text.includes('/') || text.match(/\//g).length > 1) return false
  const numbers = text.split('/')
  return (
    validInputInteger(numbers[0]) &&
    validInputInteger(numbers[1]) &&
    eval(text) < 1
  )
}
