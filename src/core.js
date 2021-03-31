/**
 *
 * The fundamental functions, e.g. init
 *
 */

import { v4 as uuid } from 'uuid'

/**
 * Must be called before any other functions
 *
 */
export function init(options = {}, callback) {
  options = Object.assign(
    {
      id: uuid(),
    },
    options
  )

  if (callback)
    callback({
      id: options.id,
      timestamp: new Date(),
    })
}
