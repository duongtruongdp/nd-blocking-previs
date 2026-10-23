# M5D.7 Timeline Workspace Session State

Timeline viewport state is workstation UI state, not filmmaking content. The
session is held by `App` in `timelineWorkspaceSessionRef`, so switching
between mounted timeline components does not lose the user's working view.

## State ownership

- Master Timeline owns one session view containing zoom, horizontal/vertical
  scroll coordinates, and lane heights.
- Scene Timeline owns one view per Scene ID containing zoom and horizontal and
  vertical scroll coordinates.
- Playhead, In/Out, keyframes, clips, and other production values remain in
  their existing `ProjectDocument`/timeline state and keep their current
  history and Live Review semantics.

The Master and Scene views never share a transient zoom value. Master graphics
lane heights are keyed by stable track IDs; deleted graphics tracks are pruned
from the session state. New tracks receive the canonical default height.

## Restoration and reset behavior

The components report viewport changes to the App session ref. On remount,
layout-aware restoration clamps the saved scroll position to the current
scroll range after the timeline geometry exists. Fit is a user action and
stores the resulting zoom and scroll, while remounting does not invoke Fit.

The session state is reset for New Project, Load Project, recovery/opened
project replacement, and a different Live Review project. Scene additions and
ordinary Scene switching do not clear existing per-Scene state. Save and Save
As do not touch it.

## Dirty state, history, Live Review, and export

Zoom, scroll, and lane-height updates do not call project mutation helpers,
create `ProjectHistory` entries, affect the M5D.6 dirty checkpoint, enter
`.ndblock` serialization, broadcast through Live Review, or affect export.
Hosts and viewers may therefore have different local timeline viewport views.

This state is intentionally in-memory for the current app session. It is not
stored in `sessionStorage` or `localStorage`, and it is not persisted across a
full app restart.
