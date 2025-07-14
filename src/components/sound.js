import { env } from '../core'

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

// iPhone-style camera shutter sound implementation
let shutterNoise, clickHi, clickLo, master

if (!usingMocha) {
  // Shared volume bus
  master = new MyVolume(-6).toDestination()

  // 1) "shh" – a very short pink-noise puff
  shutterNoise = new MyNoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.10, sustain: 0, release: 0.12 }
  }).connect(new MyVolume(-14).toDestination())

  // 2) first click – bright & snappy
  clickHi = new MySynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.08 }
  }).connect(master)

  // 3) second click – a touch lower & rounder
  clickLo = new MySynth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.07 }
  }).connect(master)
} else {
  // Fake implementations for testing
  shutterNoise = new FakeNoiseSynth()
  clickHi = new FakeFeedbackSynth()
  clickLo = new FakeFeedbackSynth()
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

  const t = Tone.now()

  // "shh"
  shutterNoise.triggerAttackRelease(0.25, t)

  // "click" (bright)
  clickHi.triggerAttackRelease(1400, 0.07, t)

  // "clack" (lower, follows 70 ms later)
  clickLo.triggerAttackRelease(750, 0.07, t + 0.07)
}
