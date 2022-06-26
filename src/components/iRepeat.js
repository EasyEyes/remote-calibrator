// Use performance.now() to control the "FPS" of a repeatedly called function

export function iRepeat(fun, options = { framerate: 60, break: false }) {
  let now = 0,
    then = 0,
    elapsed = 0
  const interval = 1000 / options.framerate

  const r = () => {
    if (!options.break) requestAnimationFrame(r)

    now = performance.now()
    elapsed = now - then

    if (elapsed > interval) {
      then = now - (elapsed % interval)
      fun()
    }
  }

  requestAnimationFrame(r)
}

export function iRepeatAsync(fun, options = { framerate: 60, break: false }) {
  let now = 0,
    then = 0,
    elapsed = 0
  const interval = 1000 / options.framerate

  return new Promise(resolve => {
    const r = async () => {
      if (!options.break) {
        // not break
        requestAnimationFrame(r)
      } else {
        // break
        resolve(now)
      }

      now = performance.now()
      elapsed = now - then

      if (elapsed > interval) {
        then = now - (elapsed % interval)
        await fun()
      }
    }

    requestAnimationFrame(r)
  })
}
