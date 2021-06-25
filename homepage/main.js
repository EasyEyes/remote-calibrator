/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

RemoteCalibrator.init({ id: 'session_demo' })
RemoteCalibrator.panel(
  ['screenSize', 'trackGaze', 'trackDistance'],
  '#rc-panel-holder',
  {},
  () => {
    party.confetti(document.querySelector('.rc-panel-step-finish'), {
      count: party.variation.range(40, 60),
    })
  }
)
