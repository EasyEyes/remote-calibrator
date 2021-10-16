import RemoteCalibrator from './core'

import './const'

import './screenSize'

import './distance/distance'
import './distance/distanceTrack'
import './interpupillaryDistance'

import './gaze/gaze'
import './gaze/gazeCalibration'
import './gaze/gazeAccuracy'
import GazeTracker from './gaze/gazeTracker'

import './panel'
import './customization'

import './css/main.css'
import './css/screenSize.css'
import './css/distance.scss'
import './css/gaze.css'

import 'animate.css'
import 'sweetalert2/src/sweetalert2.scss'
import './css/swal.css'

const r = new RemoteCalibrator()
r.gazeTracker = new GazeTracker(r)

export default r
