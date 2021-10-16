import { phrases } from '../i18n'
import '../css/buttons.scss'

export const addButtons = (RCL, parent, { go, cancel }, showCancelButton) => {
  const buttons = document.createElement('div')
  buttons.className = 'rc-buttons'
  buttons.id = 'rc-buttons'

  let goButton, cancelButton

  if (go) {
    goButton = document.createElement('button')
    goButton.className = 'rc-button rc-go-button'
    goButton.onclick = go
    goButton.innerHTML = phrases.RC_ok[RCL]
    buttons.appendChild(goButton)
  }

  if (cancel && showCancelButton) {
    cancelButton = document.createElement('button')
    cancelButton.className = 'rc-button rc-cancel-button'
    cancelButton.onclick = cancel
    cancelButton.innerHTML = phrases.RC_cancel[RCL]
    buttons.appendChild(cancelButton)
  }

  parent.appendChild(buttons)

  return [buttons, goButton, cancelButton]
}

export const removeButtons = parent => {
  parent.querySelector('#rc-buttons').remove()
}
