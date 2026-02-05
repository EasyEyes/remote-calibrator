import Swal from 'sweetalert2'

import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'

import AllowCam from '../media/allow-camera.png?width=240&height=120'

export const checkPermissions = async RC => {
  if (navigator.permissions?.query) {
    return navigator.permissions
      .query({ name: 'camera' })
      .then(async permissionObj => {
        if (permissionObj.state === 'prompt') {
          let html = `${phrases.RC_requestCamera[RC.L]}`
          if (!RC.options.saveSnapshots) {
            html += `<br />${phrases.RC_privacyCamera[RC.L]}`
          }
          return await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            imageUrl: AllowCam,
            imageWidth: 480,
            imageAlt: 'Please allow camera access',
            html: html,
          })
        }
      })
      .catch(error => {
        console.error(error)
      })
  }
}
