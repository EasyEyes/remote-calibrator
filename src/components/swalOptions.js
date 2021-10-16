import { phrases } from '../i18n'

export const swalInfoOptions = RC => {
  return {
    icon: 'info',
    allowEscapeKey: false,
    allowEnterKey: false,
    allowOutsideClick: false,
    showConfirmButton: true,
    confirmButtonText: phrases.RC_ok[RC.L],
    showClass: {
      popup: 'animate__animated animate__fadeInUp',
      // backdrop: 'animate__animated animate__fadeIn',
    },
    hideClass: {
      popup: 'animate__animated animate__fadeOutDown',
      // backdrop: 'animate__animated animate__fadeOut',
    },
    iconColor: RC._CONST.COLOR.ORANGE,
    confirmButtonColor: '#aaa',
    customClass: {
      icon: 'my__swal2__icon',
      title: 'my__swal2__title',
      htmlContainer: 'my__swal2__html' + ` rc-lang-${RC.LD.toLowerCase()}`,
    },
  }
}
