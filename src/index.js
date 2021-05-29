import RemoteCalibrator from './core'

import './screenSize'
import './displaySize'
import './distance/distance'
import './distance/distanceTrack'

import './gaze/gaze'
import './gaze/gazeCalibration'
import './gaze/gazeAccuracy'
import GazeTracker from './gaze/gazeTracker'

import './webcam'

import './css/main.css'
import './css/screenSize.css'
import './css/distance.css'
import './css/gaze.css'

import 'animate.css'
import 'sweetalert2/src/sweetalert2.scss'
import './css/swal.css'

const r = new RemoteCalibrator()
r.gazeTracker = new GazeTracker(r)

export default r
