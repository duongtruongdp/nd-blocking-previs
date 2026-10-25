import { describe, expect, it } from 'vitest'
import { fitMasterPixelsPerFrame, masterFrameRangeToPixels, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'
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

  it('maps the final timeline pixel to the inclusive end boundary', () => {
    const duration = 100
    const scale = 4
    const finalPixel = masterFrameToPixel(duration, scale)
    expect(pixelToMasterFrame(finalPixel, scale, duration)).toBe(duration)
    expect(masterFrameToPixel(duration, scale)).toBe(finalPixel)
    expect(pixelToMasterFrame(finalPixel - scale, scale, duration)).toBe(duration - 1)
  })

  it('keeps cumulative clip ends on the same canonical boundary at low zoom', () => {
    const durations = [12, 5, 23]
    const scale = 0.02
    const totalFrames = durations.reduce((sum, duration) => sum + duration, 0)
    let cursor = 0
    const clipEnds = durations.map((duration) => {
      cursor += duration
      return masterFrameToPixel(cursor, scale)
    })
    expect(clipEnds.at(-1)).toBe(masterFrameToPixel(totalFrames, scale))
    expect(clipEnds.every((end, index) => end === masterFrameToPixel(durations.slice(0, index + 1).reduce((sum, duration) => sum + duration, 0), scale))).toBe(true)
  })

  it('derives adjacent Shot edges from absolute frame boundaries at minimum zoom', () => {
    const durations = [1, 2, 1, 7, 3, 1, 5, 2, 4, 1, 3, 2, 1, 6, 2, 1, 8, 1, 2, 3, 1, 4, 2, 1, 5, 2, 1, 3, 2, 1]
    const scale = 0.02
    let cursor = 0
    for (const duration of durations) {
      const geometry = masterFrameRangeToPixels(cursor, cursor + duration, scale)
      expect(geometry.startPx).toBe(masterFrameToPixel(cursor, scale))
      expect(geometry.endPx).toBe(masterFrameToPixel(cursor + duration, scale))
      expect(geometry.widthPx).toBe(geometry.endPx - geometry.startPx)
      cursor += duration
    }
    expect(masterFrameRangeToPixels(0, cursor, scale).endPx).toBe(masterFrameToPixel(cursor, scale))
  })

  it('keeps the captured 24-frame Shot at low zoom near its canonical 5.09px width', () => {
    const scale = 0.21207155056179783
    const geometry = masterFrameRangeToPixels(0, 24, scale)

    expect(geometry.widthPx).toBeCloseTo(24 * scale, 10)
    expect(geometry.widthPx).toBeCloseTo(5.09, 2)
    expect(geometry.widthPx).not.toBe(18)
  })

  it('keeps consecutive low-zoom Shots edge-to-edge without visual width inflation', () => {
    const scale = 0.21207155056179783
    const durations = Array.from({ length: 31 }, () => 24)
    let cursor = 0
    let previousEnd = 0

    for (const duration of durations) {
      const geometry = masterFrameRangeToPixels(cursor, cursor + duration, scale)
      expect(geometry.startPx).toBeGreaterThanOrEqual(previousEnd)
      expect(geometry.widthPx).toBeCloseTo(geometry.endPx - geometry.startPx, 10)
      previousEnd = geometry.endPx
      cursor += duration
    }

    expect(previousEnd).toBe(masterFrameToPixel(cursor, scale))
  })

  it('preserves fractional and one-frame widths across minimum, medium, and high zoom', () => {
    for (const scale of [0.02, 0.21207155056179783, 2, 8]) {
      const oneFrame = masterFrameRangeToPixels(7, 8, scale)
      const fractional = masterFrameRangeToPixels(7, 10, scale)
      expect(oneFrame.widthPx).toBeCloseTo(scale, 10)
      expect(fractional.widthPx).toBeCloseTo(scale * 3, 10)
    }
  })

  it('keeps Mark Out earlier than the sequence end as a distinct canonical boundary', () => {
    const scale = 0.02
    const sequenceEnd = 240
    const markOut = 180
    const sequenceEndPx = masterFrameToPixel(sequenceEnd, scale)
    const markOutPx = masterFrameRangeToPixels(markOut, markOut, scale).startPx
    expect(markOutPx).toBe(masterFrameToPixel(markOut, scale))
    expect(markOutPx).toBeLessThan(sequenceEndPx)
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
