# M5A.2 — Live Presence + Review Tools

M5A.2 extends the read-only Host → Viewer review room without changing
`ProjectDocument` or adding a collaborative editing role.

## Runtime-only state

Participant identity, connection status, Follow Host, presenter pointer, and
chat are session-only. The relay stores only the current in-memory roster,
latest pointer, and bounded recent chat. None of these fields are serialized to
`.ndblock`, `.ndscene`, recovery snapshots, or the Project Library.

## Participants and reconnect

The room has one Host and many Viewers. A participant supplies a display name;
blank names fall back to Host or Guest. The relay exposes only participant ID,
display name, role, and `connected`/`reconnecting` status. An internal
participant token preserves the same identity during reconnect grace without
placing a token in the invite URL.

## Follow Host / Free Look

Viewer Follow Host defaults on. Host presentation state and authoritative
project revisions apply immediately while it is enabled. Turning it off keeps
the latest Host project/state and transform previews buffered while the Viewer
may inspect, navigate, select, and scrub locally. Re-enabling Follow Host
applies the latest buffered state rather than replaying stale intermediate
messages. Viewer mutation callbacks remain blocked.

## Presenter pointer

The Host can activate a compact Stage pointer. The wire payload uses normalized
Stage coordinates (`x`, `y` in `[0, 1]`), a `stage` surface, visibility, and an
updated timestamp. Updates are throttled at approximately 30 Hz, the relay
stores only the latest value, and the pointer clears on release, inactivity,
disconnect, and session end. Viewers never publish pointers.

## Chat

Chat is an ephemeral room tool, not a Project or Shot comment system. Messages
are plain text, whitespace-normalized, limited to 1000 characters, rate-limited
to five messages per ten seconds per participant, and retained only as the
latest 100 messages. New participants receive the bounded history; session
expiry or End Session clears it. Message content is not logged.

The same typed protocol is used by Web and Desktop clients through the existing
public relay. No LAN, P2P, editor role, persistence, voice, video, or asset
synchronization is introduced.
