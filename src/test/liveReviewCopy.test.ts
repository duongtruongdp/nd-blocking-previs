import { describe, expect, it } from 'vitest'
import { LIVE_REVIEW_START_COPY } from '../core/liveReviewCopy'

describe('Live Review startup copy', () => {
  it('uses the concise user-facing startup language', () => {
    expect(LIVE_REVIEW_START_COPY).toEqual({
      eyebrow: 'LIVE REVIEW',
      heading: 'Review together, in real time.',
      description: 'Invite your team to explore the scene and share feedback.',
      nameLabel: 'Your name',
      primaryAction: 'Start Live Review',
    })
    expect(LIVE_REVIEW_START_COPY.description).not.toContain('Host remains canonical')
    expect(LIVE_REVIEW_START_COPY.description).not.toContain('read-only')
  })
})
