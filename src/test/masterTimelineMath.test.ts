import { describe, expect, it } from 'vitest'
import { fitMasterPixelsPerFrame, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'
import { downsampleAudioPeaks } from '../core/musicWaveform'

describe('master timeline geometry', () => {
  const rate = { numerator: 24, denominator: 1 }

  it('fits the complete visible Master duration, including long Music', () => {
    const contentDuration = Math.max(84, 190 * 24)
    const scale = fitMasterPixelsPerFrame(840, contentDuration, rate)
    expect(masterFrameToPixel(contentDuration, scale)).toBe(840)
    expect(masterFrameToPixel(84, scale)).toBeLessThan(840)
  })

  it('uses one reversible frame/pixel mapping at multiple zoom levels', () => {
    for (const scale of [.5, 2, 8]) {
      const pixel = masterFrameToPixel(37, scale)
      expect(pixelToMasterFrame(pixel, scale, 100)).toBe(37)
      expect(pixelToMasterFrame(pixel + scale * .49, scale, 100)).toBe(37)
    }
  })

  it('generates chronological ruler marks from the same scale', () => {
    const marks = masterRulerFrames(240, 3, rate)
    expect(marks[0]).toBe(0)
    expect(marks.every((frame, index) => index === 0 || frame > marks[index - 1])).toBe(true)
  })
})

describe('music waveform peaks', () => {
  it('downsamples silence to zero', () => {
    expect(downsampleAudioPeaks([new Float32Array(32)], 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('keeps an impulse in its source bucket and combines stereo deterministically', () => {
    const left = new Float32Array(16)
    const right = new Float32Array(16)
    left[2] = .4
    right[10] = -.8
    expect(downsampleAudioPeaks([left, right], 4)).toEqual([expect.closeTo(.4, 6), 0, expect.closeTo(.8, 6), 0])
  })
})
