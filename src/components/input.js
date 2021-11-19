import { addButtons } from './buttons'

import Arrow from '../media/two-sided-horizontal.svg'

const _exampleMeasure = {
  cm: '22.5',
  inDecimal: '11.5',
  inFractional: ['12', '3/16'],
}

export const takeInput = async RC => {
  const unit = RC.equipment.value.unit
  const unitDisplay = unit === RC._CONST.UNITS.CM ? 'cm' : 'in'

  const formItem = `<div class="rc-form">
  <div class="rc-form-inputs">
  ${
    unit === RC._CONST.UNITS.IN_F
      ? ``
      : `<input type="text" class="rc-form-input" placeholder="Your measure, e.g. ${_exampleMeasure[unit]}" /><span>${unitDisplay}</span>`
  }
  </div>
  </div>`
  // <button class="rc-form-submit rc-button rc-custom-button" disabled>OK</button>

  const instruction = RC.background.querySelector('.calibration-instruction')
  instruction.innerHTML += formItem
  const formElement = instruction.querySelector('.rc-form')
  const formInputElement = instruction.querySelector('.rc-form-input')
  // const formSubmitElement = instruction.querySelector('.rc-form-submit')

  const addedButtons = addButtons(
    RC.L,
    formElement,
    {
      go: () => {},
      cancel: () => {},
    },
    true,
    false
  )
  const goButton = addedButtons[1]
  const cancelButton = addedButtons[2]

  formInputElement.oninput = () => {
    if (validInput(formInputElement.value)) {
      formInputElement.classList.remove('rc-input-error')
      goButton.disabled = false
    } else {
      formInputElement.classList.add('rc-input-error')
      goButton.disabled = true
    }
  }

  // Arrow
  const arrow = document.createElement('div')
  RC.background.appendChild(arrow)
  arrow.outerHTML = Arrow

  return new Promise(resolve => {
    goButton.onclick = () => {
      onFormSubmit(formInputElement.value, resolve)
    }
    cancelButton.onclick = () => {
      resolve(null)
    }
  })
}

const onFormSubmit = (value, resolve) => {
  if (validInput(value)) {
    resolve(value)
  }
}

// const onFormCancel = e => {}

/* -------------------------------------------------------------------------- */

const validInput = text => {
  return !isNaN(text)
}
