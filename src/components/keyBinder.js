/**
 * Bind keys, e.g., SPACE (' '), ESC ('Escape')
 * keys is an object of keys of the keys, pointing to its binding functions
 */
export function bindKeys(keys, eventType = 'keydown') {
  const bindingFunctions = e => {
    if (e.key in keys) {
      e.preventDefault()
      keys[e.key](e)
    }
  }

  document.body.addEventListener(eventType, bindingFunctions)
  return bindingFunctions
}

export function unbindKeys(event, eventType = 'keydown') {
  document.body.removeEventListener(eventType, event)
}
