# M5A — Live Review Foundation

M5A adds a read-only Host → Viewer review session. The Host remains the only
authority; Viewers receive a session-only project and presentation state and
render it locally with the existing editor, Stage, Camera View, Shot List, and
timeline systems.

## Runtime boundary

`ProjectDocument` remains persistent creative data: Scenes, Actors, Props,
Cameras, Lights, Scene Timelines, Shots, Master Sequence, Shot List metadata,
and Music metadata. `LiveReviewState` is runtime-only and is never written to
`.ndblock`, `.ndscene`, recovery snapshots, or the Project Library.

Live state includes workspace, active Scene/Shot/Camera, Scene/Master timeline
mode and playheads, playback flags, Camera Preview context, Shot List view and
filter, Present mode, and the monotonic project revision.

The relay does not receive Three.js objects, DOM state, runtime references,
local paths, object URLs, passwords, or Music bytes. Music metadata and timing
are included through the project snapshot; Viewers without the IndexedDB audio
asset do not hear the Host’s Music in M5A.

## Transport and relay

The browser uses `LiveReviewTransport`, an app-owned WebSocket abstraction.
The standalone Node relay is in `live-server/` and stores rooms in memory with
a one-hour sliding TTL. Session IDs and Host tokens are high-entropy random
values. `VITE_LIVE_RELAY_URL` selects the relay. Local development defaults to
`ws://localhost:8787/live`; production requires an explicit `wss://` value and
fails closed when it is missing. See [M5A.1 Public Live Relay](./M5A1_PUBLIC_LIVE_RELAY.md)
for public deployment, origin policy, limits, health checks, and remote-network
acceptance.

Start it with:

```sh
npm run live-server
```

The relay accepts one Host and multiple Viewers. Only the Host can publish
project snapshots, presentation state, transform previews, presenter pointer
state, or end a session. Viewers are rejected at the protocol boundary if
they attempt authoritative publish operations. Session-only participant
identity is restored during reconnect grace with an internal token; no
identity is written to project files.

## Synchronization strategy

- Initial join: full serialized `ProjectDocument` snapshot using the existing
  `.ndblock` serializer and validation path.
- Creative edits: monotonic authoritative project revisions; full snapshots are
  used for M5A reliability rather than introducing a second patch schema.
- Transform drags: lightweight `{ sceneId, entityId, position, rotation, scale }`
  messages are sent during the drag; the committed Host project change then
  arrives as the next project revision.
- Timeline and workspace state: `LiveReviewState` is sent separately, with
  frame updates throttled to a practical interval while playback is active and
  exact state sent for paused/selection changes.

Stage editor-camera orbit/pan/zoom is intentionally not synchronized; the
Viewer follows the production presentation context, not the Host’s private
editor navigation camera. M5A.2 adds a local Follow Host switch: Free Look
buffers the latest Host project/presentation state and applies it when Follow
Host is enabled again.

## UI behavior

The top bar exposes `Live`. The Host and Viewer choose session-only display
names. The panel provides Participants and ephemeral Chat tabs, a Host-only
presenter pointer toggle, Viewer Follow Host/Free Look, the invite URL, and
End/Exit actions. Viewer-side project mutation callbacks, transform tools,
arrange controls, timeline edits, save, and export are disabled or ignored.

Camera Preview, Blocking/Camera/Shot List workspace, active Scene/Shot/Camera,
Shot List Present state, and Scene/Master playback context follow the Host.

Presence and chat remain in relay memory only. Chat is normalized plain text,
bounded to 100 recent messages, limited to 1000 characters per message, and
rate-limited. The presenter pointer is Host-only, normalized to the Stage
surface, throttled, and cleared on release, inactivity, disconnect, or session
end. Presence exposes only participant ID, display name, role, and connection
status.

## M5B handoff

M5B can add patch-level project updates, asset distribution, richer reconnect
grace handling, and multi-user editing. Follow Host, participant identity,
pointer, and ephemeral chat are already protocol-level M5A.2 features. Editor
roles and conflict policy remain outside this foundation.
