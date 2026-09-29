import Swal from 'sweetalert2'
import { observeDialog } from '../interactionLifecycle'

import { phrases } from '../i18n/schema'
import { swalInfoOptions } from './swalOptions'
import { processInlineFormatting } from '../distance/markdownInstructionParser'

import AllowCam from '../media/allow-camera.png?width=240&height=120'

export const checkPermissions = async (RC, message) => {
  if (navigator.permissions?.query) {
    return navigator.permissions
      .query({ name: 'camera' })
      .then(async permissionObj => {
        if (permissionObj.state === 'prompt') {
          const observation = observeDialog(RC, 'camera-permission')
          const result = await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            didDestroy: observation.didDestroy,
            icon: undefined,
            imageUrl: AllowCam,
            imageWidth: 480,
            imageAlt: 'Please allow camera access',
            // Rendered as HTML; enable inline markdown in the permission copy.
            // processInlineFormatting is idempotent, preserves the <br /> joins,
            // and is a no-op for plain text, so existing messages are unchanged.
            html: processInlineFormatting(message),
          })
            .then()
            .catch(observation.failed)
          observation.settled(result)
          return result
        }
      })
      .catch(error => {
        console.error(error)
      })
  }
}
