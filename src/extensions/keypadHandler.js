// Add event handlers
export const onVariableChange_key_resp_allKeys = (keypadHandler, callback) => {
  if (!keypadHandler) return () => {}
  keypadHandler.event_handlers.current.push(callback)

  // Return a function to remove the specific handler
  return () => {
    keypadHandler.event_handlers.current =
      keypadHandler.event_handlers.current.filter(
        handler => handler !== callback,
      )
  }
}

// Clear all event handlers
export const clearAllHandlers_key_resp_allKeys = keypadHandler => {
  if (!keypadHandler) return
  keypadHandler.event_handlers.current = []
}

// Setup the handler
export const setUpEasyEyesKeypadHandler = (
  e,
  keypadHandler,
  callback = null,
  removeBool = true,
  keys = ['return'],
  RC = null,
  passKeyToCallback = false,
) => {
  if (!keypadHandler) return () => {}

  if (keypadHandler.keypad) {
    keypadHandler.keypad.update(keys)
  }
  const removeHandler = onVariableChange_key_resp_allKeys(
    keypadHandler,
    newValue => {
      if (keys.includes(newValue.name)) {
        keypadHandler.all_keys.current = []

        if (RC && RC.disableKeypadHandler) return

        if (e) e.click()

        if (callback) passKeyToCallback ? callback(newValue.name) : callback()

        if (removeBool) {
          removeHandler()
        }
      }
    },
  )

  return removeHandler
}
