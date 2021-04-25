// import { ImageCapture } from 'image-capture'
import EXIF from 'exif-js'

import RemoteCalibrator from './core'
import { blurAll, constructInstructions } from './helpers'

/**
 * Get info of the webcam
 */
RemoteCalibrator.prototype.webcam = function (callback) {
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  const self = this
  const headline = '📷 Read Webcam Information'
  const description = `We will read the information of your webcam. When asked, please grant permission to access your camera. \nThe program will close automatically after finishing gaining data.`

  this._addBackground(constructInstructions(headline, description))

  async function processPhoto(blob) {
    // console.log(EXIF.readFromBinaryFile(await blob.arrayBuffer()))
    const file = new File([blob], 'webcam.jpg', { type: 'image/jpeg' })
    EXIF.getData(file, function () {
      const make = EXIF.getAllTags(file)
      console.log(make)
      end(self, callback, make)
    })
  }

  let videoDevice, captureDevice
  navigator.mediaDevices.getUserMedia({ video: true }).then(mediaStream => {
    videoDevice = mediaStream.getVideoTracks()[0]
    if (videoDevice) {
      // https://github.com/GoogleChromeLabs/imagecapture-polyfill
      captureDevice = new ImageCapture(videoDevice)
      if (captureDevice) {
        captureDevice.takePhoto().then(processPhoto)
      } else {
        end(this, callback, null)
      }
    } else {
      end(this, callback, null)
    }
  })
}

function end(self, callback, data) {
  if (callback) callback(data)
  self._removeBackground()
}
