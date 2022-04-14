import { addButtons, removeButtons } from './buttons'

import { bindKeys, unbindKeys } from './keyBinder'
import { powerOf2, safeExecuteFunc } from './utils'

// const _exampleMeasure = {
//   cm: '22.5',
//   inDecimal: '11.5',
//   inFractional: ['12', '3/16'],
// }

export const takeInput = async (
  RC,
  extraFunction = null,
  extraFunctionOut = null,
  customButtonConfig = null
) => {
  const unit = RC.equipment.value.unit
  const unitDisplay = unit === RC._CONST.UNITS.CM ? 'cm' : 'in'
  const unitIsFraction = unit === RC._CONST.UNITS.IN_F

  // ! Elements
  const formItem = `<div class="rc-form">
  <div class="rc-form-inputs">
  ${
    unitIsFraction
      ? `<input type="text" class="rc-form-input rc-form-input-f-integer" placeholder="integer" /><input type="text" class="rc-form-input rc-form-input-f-fraction" placeholder="fraction (like 3/8) or 0" /><span>${unitDisplay}</span>`
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
      custom: customButtonConfig ? customButtonConfig : undefined,
    },
    true,
    false
  )
  const goButton = addedButtons[1]
  const customButton = addedButtons[3]
  // const cancelButton = addedButtons[2]

  goButton.disabled = true

  // ! oninput
  const eleOkay = ele => {
    ele.classList.remove('rc-input-error')
    goButton.disabled = false
  }
  const eleError = ele => {
    if (!isAcceptedSingleInput(ele.value.slice(-1))) {
      // Remove unaccepted chars
      ele.value = ele.value.substring(0, ele.value.length - 1)
    } else {
      ele.classList.add('rc-input-error')
      goButton.disabled = true
    }
  }
  const setupEleOninput = (ele, validationFunction) => {
    ele.oninput = () => {
      if (validationFunction(ele.value)) eleOkay(ele)
      else eleError(ele)
    }
  }
  const _validationForFraction = () => {
    let allOkay = true
    if (!validInputInteger(formInputElementFInteger.value)) {
      eleError(formInputElementFInteger)
      allOkay = false
    } else eleOkay(formInputElementFInteger)
    if (!validInputFraction(formInputElementFFraction.value)) {
      eleError(formInputElementFFraction)
      allOkay = false
    } else eleOkay(formInputElementFFraction)
    return allOkay
  }

  if (!unitIsFraction) setupEleOninput(formInputElement, validInput)
  else {
    formInputElementFInteger.oninput = _validationForFraction
    formInputElementFFraction.oninput = _validationForFraction
  }
  ////

  // ! Arrow, etc.
  safeExecuteFunc(extraFunction)

  // ! Finish
  return new Promise(resolve => {
    const bFunction = () => {
      removeInputElements(formElement, extraFunctionOut)
      unbindKeys(bindKeysFunction)
      resolve(null)
    }
    const fFunction = () => {
      let valid = false
      let numericalValue, inputValue
      if (
        unitIsFraction &&
        validInputInteger(formInputElementFInteger.value) &&
        validInputFraction(formInputElementFFraction.value)
      ) {
        // FRACTION
        valid = true
        numericalValue =
          parseInt(formInputElementFInteger.value) +
          eval(formInputElementFFraction.value)
        inputValue =
          formInputElementFInteger.value + ' ' + formInputElementFFraction.value
      } else if (!unitIsFraction && validInput(formInputElement.value)) {
        // OTHERS
        valid = true
        numericalValue =
          Number(formInputElement.value) ||
          Number(formInputElement.value.replace(',', '.'))
        inputValue = formInputElement.value
      }

      if (valid) {
        removeInputElements(formElement, extraFunctionOut)
        unbindKeys(bindKeysFunction)
        resolve({
          value: {
            numerical: numericalValue, // Parsed numerical
            input: inputValue, // Original input
            unit: unit,
          },
          timestamp: performance.now(),
        })
      }
    }

    // Bind buttons
    goButton.onclick = fFunction
    // cancelButton.onclick = bFunction
    customButton.onclick = bFunction

    // Bind keys
    const bindKeysFunction = bindKeys({
      Enter: fFunction,
      Escape: bFunction,
    })
  })
}

const removeInputElements = (formElement, extraFunctionOut) => {
  // Remove
  removeButtons(formElement)
  for (let child of formElement.children) child.remove()
  formElement.remove()
  //
  safeExecuteFunc(extraFunctionOut)
}

/* -------------------------------------------------------------------------- */

const validInput = text => {
  return (
    text.length > 0 &&
    !text.includes(' ') &&
    (!isNaN(text) || !isNaN(text.replace(',', '.')))
  )
}

const validInputInteger = text => {
  if (!validInput(text)) return false
  return parseInt(text) === Number(text) && Number(text) > 0
}

const validInputFraction = text => {
  if (text === '0') return true
  if (!text.includes('/') || text.match(/\//g).length > 1) return false
  const numbers = text.split('/')
  return (
    validInputInteger(numbers[0]) &&
    validInputInteger(numbers[1]) &&
    powerOf2(numbers[1]) &&
    eval(text) < 1
  )
}

const isAcceptedSingleInput = char => {
  return /[0-9]/.test(char) || ['.', '/', ','].includes(char)
}
