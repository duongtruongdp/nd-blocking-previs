import NodeWebSocket from 'ws'
import { createProjectDocument } from '../src/core/projectDocument'
import { createEmptySceneDocument } from '../src/core/sceneDocument'
import { LiveReviewTransport } from '../src/liveReview/liveReviewTransport'
import { defaultLiveReviewState } from '../src/liveReview/protocol'

type HarnessWindow = typeof globalThis & { WebSocket: typeof NodeWebSocket; window: typeof globalThis }

export async function runLiveReviewTransportHarness(relayUrl: string, origin: string): Promise<void> {
  class HarnessWebSocket extends NodeWebSocket {
    constructor(url: string | URL) {
      super(url, { origin })
    }
  }

  const runtime = globalThis as HarnessWindow
  runtime.window = globalThis
  runtime.WebSocket = HarnessWebSocket

  const hostParticipants: string[] = []
  const viewerStatuses: string[] = []
  const host = new LiveReviewTransport(relayUrl, {
    onStatus: (status) => console.log(`[transport-harness] host status=${status}`),
    onMessage: (message) => {
      if (message.type === 'presence_snapshot') {
        hostParticipants.splice(0, hostParticipants.length, ...message.participants.filter((participant) => participant.status === 'connected').map((participant) => participant.participantId))
      }
    },
  })
  const viewer = new LiveReviewTransport(relayUrl, {
    onStatus: (status) => { viewerStatuses.push(status); console.log(`[transport-harness] viewer status=${status}`) },
  })
  try {
    const response = await host.createSession('Transport Harness Host', 'harness-host')
    if (response.type !== 'session_created' || !host.connected) throw new Error('LiveReviewTransport did not establish a connected Host session.')
    console.log('[transport-harness] host createSession resolved type=session_created connected=true')
    const project = createProjectDocument('transport-harness-project', 'Transport Harness', createEmptySceneDocument())
    host.send({ type: 'host_project_snapshot', project, revision: 1 })
    host.send({ type: 'host_present_state', state: defaultLiveReviewState(project) })
    const snapshot = await viewer.joinSession(response.session, 'Transport Harness Viewer', 'harness-viewer')
    if (snapshot.type !== 'session_snapshot' || !viewer.connected) throw new Error('LiveReviewTransport did not establish a connected Viewer session.')
    console.log('[transport-harness] viewer joinSession resolved type=session_snapshot connected=true')
    await new Promise((resolve) => setTimeout(resolve, 35_000))
    if (!viewer.connected) throw new Error('Viewer disconnected during heartbeat soak.')
    if (!hostParticipants.includes(viewer.participantId)) throw new Error('Host did not observe the Viewer as connected after heartbeat soak.')
    console.log('[transport-harness] viewer remained connected across multiple heartbeat intervals; host observed connected viewer')
    const viewerSocket = (viewer as unknown as { socket: NodeWebSocket | null }).socket
    viewerSocket?.close(1000, 'harness-reconnect')
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    if (!viewerStatuses.includes('reconnecting') || !viewer.connected) throw new Error('Viewer did not recover through the reconnect lifecycle after a socket close.')
    if (!hostParticipants.includes(viewer.participantId)) throw new Error('Host did not observe the Viewer as connected after reconnect.')
    console.log('[transport-harness] viewer recovered to connected after socket close; host observed connected viewer')
  } finally {
    viewer.close('harness-complete')
    host.close('harness-complete')
  }
}
