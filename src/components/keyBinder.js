/**
 * Bind keys, e.g., SPACE (' '), ESC ('Escape')
 * keys is an object of keys of the keys, pointing to its binding functions
 */
export function bindKeys(keys) {
  const bindingFunctions = e => {
    if (e.key in keys) {
      e.preventDefault()
      keys[e.key]()
    }
  }

  document.body.addEventListener('keydown', bindingFunctions)

  return bindingFunctions
}

export function unbindKeys(event) {
  document.body.removeEventListener('keydown', event)
}
