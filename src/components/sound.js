import { env } from '../core'
import {
  cameraShutterSoundBase64,
  stampOfApprovalSoundBase64,
} from './audiobase64'

const usingMocha = env === 'mocha'

let MySynth
let MyVolume
let MyNoiseSynth
let Tone

if (!usingMocha) {
  Tone = require('tone')
  MySynth = Tone.Synth
  MyVolume = Tone.Volume
  MyNoiseSynth = Tone.NoiseSynth
}

class FakeFeedbackSynth {
  triggerAttackRelease() {}
}

class FakeNoiseSynth {
  triggerAttackRelease() {}
}

const feedbackSynth = usingMocha
  ? new FakeFeedbackSynth()
  : new MySynth({
      oscillator: {
        type: 'sine',
      },
      envelope: { attack: 0.001, decay: 0.001, sustain: 1, release: 0.001 },
    }).connect(new MyVolume(-17).toDestination())

const softFeedbackSynth = usingMocha
  ? new FakeFeedbackSynth()
  : new MySynth({
      oscillator: {
        type: 'sine',
      },
    }).connect(new MyVolume(-5).toDestination())

// iPhone-style camera shutter sound implementation (keeping for fallback)
let shutterNoise, clickHi, clickLo, master

if (!usingMocha) {
  // Shared volume bus
  master = new MyVolume(-6).toDestination()

  // 1) "shh" – a very short pink-noise puff
  shutterNoise = new MyNoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.12 },
  }).connect(new MyVolume(-14).toDestination())

  // 2) first click – bright & snappy
  clickHi = new MySynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.08 },
  }).connect(master)

  // 3) second click – a touch lower & rounder
  clickLo = new MySynth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.07 },
  }).connect(master)
} else {
  // Fake implementations for testing
  shutterNoise = new FakeNoiseSynth()
  clickHi = new FakeFeedbackSynth()
  clickLo = new FakeFeedbackSynth()
}

// Custom shutter sound - replace this base64 string with your 1-second MP3 file
// To convert your MP3 to base64, you can use this command in terminal:
// base64 -i your-shutter-sound.mp3 | tr -d '\n'
const CUSTOM_SHUTTER_SOUND_BASE64 = cameraShutterSoundBase64

// Helper function to create audio from base64
const createAudioFromBase64 = base64String => {
  try {
    // Convert base64 to binary
    const binaryString = atob(base64String)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Create blob and audio element
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const audio = new Audio(URL.createObjectURL(blob))
    audio.volume = 0.7 // Adjust volume as needed (0.0 to 1.0)
    return audio
  } catch (error) {
    console.error('Error creating audio from base64:', error)
    return null
  }
}

// Create custom shutter sound audio object
let customShutterAudio = null
if (!usingMocha && CUSTOM_SHUTTER_SOUND_BASE64 !== 'YOUR_BASE64_STRING_HERE') {
  customShutterAudio = createAudioFromBase64(CUSTOM_SHUTTER_SOUND_BASE64)
}

export const soundFeedback = (style = 0) => {
  switch (style) {
    case 0:
      feedbackSynth.triggerAttackRelease(2000, 0.05)
      return

    case 1:
      // Negative feedback
      feedbackSynth.triggerAttackRelease(500, 0.5)
      return

    case 2:
      // Purr
      feedbackSynth.triggerAttackRelease(200, 0.6)
      return

    case 3:
      softFeedbackSynth.triggerAttackRelease(200, 0.2)
      return

    default:
      feedbackSynth.triggerAttackRelease(2000, 0.05)
      return
  }
}

export const cameraShutterSound = () => {
  if (usingMocha) return

  // Try to use custom shutter sound first
  if (customShutterAudio) {
    try {
      // Reset audio to beginning and play
      customShutterAudio.currentTime = 0
      customShutterAudio.play().catch(error => {
        console.warn(
          'Failed to play custom shutter sound, falling back to synthesized sound:',
          error,
        )
        playSynthesizedShutterSound()
      })
      return
    } catch (error) {
      console.warn(
        'Error playing custom shutter sound, falling back to synthesized sound:',
        error,
      )
      playSynthesizedShutterSound()
      return
    }
  }

  // Fallback to original synthesized sound
  playSynthesizedShutterSound()
}

// Original synthesized shutter sound function (now as fallback)
const playSynthesizedShutterSound = () => {
  const t = Tone.now()

  // "shh"
  shutterNoise.triggerAttackRelease(0.25, t)

  // "click" (bright)
  clickHi.triggerAttackRelease(1400, 0.07, t)

  // "clack" (lower, follows 70 ms later)
  clickLo.triggerAttackRelease(750, 0.07, t + 0.07)
}

// Stamp of approval sound
let stampAudio = null

if (!usingMocha) {
  stampAudio = createAudioFromBase64(stampOfApprovalSoundBase64)
}

export const stampOfApprovalSound = () => {
  if (usingMocha) return

  if (stampAudio) {
    try {
      // Reset audio to beginning and play
      stampAudio.currentTime = 0
      stampAudio.volume = 0.0625 // Reduced volume by factor of 4 (from 1.0 to 0.25), then by another 1/4 factor (0.25/4 = 0.0625)
      stampAudio.play().catch(error => {
        console.warn('Failed to play stamp of approval sound:', error)
      })
    } catch (error) {
      console.warn('Error playing stamp of approval sound:', error)
    }
  }
}
