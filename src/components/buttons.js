import { phrases } from '../i18n/schema'

export const addButtons = (
  RCL,
  parent,
  { go, cancel, custom },
  showCancelButton,
  absolutePositioning = true,
) => {
  const buttons = document.createElement('div')
  buttons.className =
    'rc-buttons' + (absolutePositioning ? ' rc-absolute-buttons' : '')
  buttons.id = 'rc-buttons'

  let goButton, cancelButton, customButton

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

  if (custom) {
    const { callback, content } = custom

    customButton = document.createElement('button')
    customButton.className = 'rc-button rc-custom-button'
    customButton.onclick = callback
    customButton.innerHTML = content
    buttons.appendChild(customButton)
  }

  parent.appendChild(buttons)

  return [buttons, goButton, cancelButton, customButton]
}

export const removeButtons = parent => {
  parent.querySelector('#rc-buttons').remove()
}
