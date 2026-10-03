import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Inspector } from '../components/Inspector'
import { blockingStore } from '../state/blockingStore'

describe('Actor character Inspector wiring', () => {
  it('renders production character controls for a newly created selected Actor', () => {
    blockingStore.addActor()
    const markup = renderToStaticMarkup(<Inspector />)

    expect(markup).toContain('Character')
    expect(markup).toContain('Actor color')
    expect(markup).toContain('Category')
    expect(markup).toContain('Pose')
    expect(markup).toContain('Height')
    expect(markup).not.toContain('Human proxy height')
  })
})
