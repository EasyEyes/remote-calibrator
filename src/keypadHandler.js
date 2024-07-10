// Function to add event handlers
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

// Function to clear all event handlers
export const clearAllHandlers_key_resp_allKeys = keypadHandler => {
  if (!keypadHandler) return
  keypadHandler.event_handlers.current = []
}

// Function to setup the handler
export const setupHandler = (
  e,
  keypadHandler,
  callback = null,
  removeBool = true,
  keys = ['return'],
) => {
  if (!keypadHandler) return () => {}
  const removeHandler = onVariableChange_key_resp_allKeys(
    keypadHandler,
    newValue => {
      if (keys.includes(newValue.name)) {
        keypadHandler.all_keys.current = []
        if (e) e.click()
        if (callback) callback()
        if (removeBool) {
          removeHandler() // Remove the handler
          //   clearAllHandlers_key_resp_allKeys(keypadHandler)
        }
      }
    },
  )

  return removeHandler
}
