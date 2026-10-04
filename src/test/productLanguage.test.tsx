import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Inspector } from '../components/Inspector'
import { ScenePanel } from '../components/ScenePanel'
import { TimelinePanel } from '../components/TimelinePanel'
import { TopBar } from '../components/TopBar'
import { blockingStore } from '../state/blockingStore'

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, ' ')
}

describe('filmmaker-facing product language', () => {
  it('keeps production labels free of implementation terminology', () => {
    blockingStore.addCamera()
    blockingStore.setSelectedCameraModel('arri.alexa-35')
    const markup = renderToStaticMarkup(
      <>
        <TopBar />
        <ScenePanel />
        <Inspector />
        <TimelinePanel />
      </>,
    )
    const text = visibleText(markup)

    expect(text).toContain('Capture Mode')
    expect(text).toContain('Sensor Area')
    expect(text).toContain('Capture Ratio')
    expect(text).toContain('Lens Type')
    expect(text).toContain('Camera Height')
    expect(text).not.toContain('INSPECTOR')
    expect(text).not.toContain('Sensor Mode')
    expect(text).not.toContain('Active Area')
    expect(text).not.toContain('Capture Aspect')
    expect(text).not.toContain('Anamorphic / Squeeze')
    expect(text).not.toContain('capture geometry')
    expect(text).not.toContain('Resolved Capture')
    expect(text).not.toContain('Object3D')

    blockingStore.deleteSelected()
  })
})
