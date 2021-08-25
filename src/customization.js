import RemoteCalibrator from './core'

RemoteCalibrator.prototype.backgroundColor = function (hex = null) {
  if (!this.checkInitialized()) return null

  // https://stackoverflow.com/a/8027444/11069914
  if (hex === null || !/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
    this._params.backgroundColor = '#ddd' // Default
  } else {
    this._params.backgroundColor = hex
  }

  let b = document.querySelector('#calibration-background')

  if (b) {
    b.style.background = this.params.backgroundColor
  }

  return this.params.backgroundColor
}

RemoteCalibrator.prototype.videoOpacity = function (op = null) {
  if (!this.checkInitialized()) return null

  if (op === null || Number(op) !== op || Number(op) > 1 || Number(op) < 0) {
    // Invalid input
    this._params.videoOpacity = 0.8
  } else {
    this._params.videoOpacity = op
  }

  let v = document.querySelector('#webgazerVideoContainer')

  if (v) {
    v.style.opacity = this.params.videoOpacity
  }

  return this.params.videoOpacity
}

RemoteCalibrator.prototype.showCancelButton = function (show = true) {
  if (!this.checkInitialized()) return null

  this._params.showCancelButton = show ? true : false
  return this.params.showCancelButton
}
