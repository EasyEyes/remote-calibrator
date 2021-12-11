import Swal from 'sweetalert2'

import { phrases } from '../i18n'
import { swalInfoOptions } from './swalOptions'

import AllowCam from '../media/allow_cam.png?width=480&height=240'

export const checkPermissions = async RC => {
  if (navigator.permissions && navigator.permissions.query) {
    return navigator.permissions
      .query({ name: 'camera' })
      .then(async permissionObj => {
        if (permissionObj.state === 'prompt') {
          return await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            imageUrl: AllowCam,
            imageWidth: 480,
            imageAlt: 'Allow Camera Access',
            html: phrases.RC_requestCamera[RC.L],
          })
        }
      })
      .catch(error => {
        console.error(error)
      })
  }
}
