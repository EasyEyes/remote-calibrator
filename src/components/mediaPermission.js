export const checkPermissions = tasks => {
  // if (navigator.permissions)
  // navigator.permissions
  //   .query({ name: 'camera' })
  //   .then(permissionObj => {
  //     console.log(permissionObj.state)
  //   })
  //   .catch(error => {
  //     console.error(error)
  //   })
  let now = Date.now()
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(function (stream) {
      // Permitted
      console.log('[GOT]', Date.now() - now)
    })
    .catch(function (err) {
      console.error('[ERROR] ', Date.now() - now)
    })
}
