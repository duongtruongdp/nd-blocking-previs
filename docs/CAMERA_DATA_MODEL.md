# Camera Data Foundation

Milestone 2.5A establishes factual camera data without adding camera UI or
placing cameras on the Stage. The dataset is versioned independently from the
`.ndblock` project format:

```text
Manufacturer data → Camera Dataset → Camera Registry
                 → Resolved Capture Selection → future Camera Document/Runtime
```

## Separate physical concepts

`PhysicalSensor` describes the manufacturer's physical imaging sensor. Its
dimensions and native pixel dimensions are optional because unknown facts are
not represented as zero.

`RecordingMode` describes the active imaging area used for one recording mode.
It owns the authoritative active width and height, sensor photosite dimensions,
window classification, mode-level frame-rate summary, anamorphic-oriented
metadata, and provenance references. Mode labels such as Open Gate, Super 35,
or 4:3 do not imply shared geometry between manufacturers.

Real ARRI data required a small schema evolution: a mode may now contain
`recordingOutputs`. Each output stores codec, file-container dimensions, image
content dimensions, output-specific frame-rate conditions, and provenance.
This preserves the relationship:

```text
Sensor mode / active photosites → recording output / file resolution + codec
```

`activeWidthPx` and `activeHeightPx` are sensor photosites. They must not be
replaced by a downsampled ProRes file size. The legacy mode-level
`recordedWidthPx`/`recordedHeightPx` fields remain optional for compatibility
with the foundation fixture; production data uses `recordingOutputs`.

The delivery frame is not stored in camera data. It is a centered crop chosen
by the future shot/camera composition and never changes the physical sensor,
recording mode, focal length, or camera placement.

## Stable IDs and dataset version

IDs are relational keys, not display labels. The intended style is a stable
lowercase namespace such as `arri.alexa-mini-lf` and
`arri.alexa-mini-lf.4_5k-open-gate`. Display-name changes must not change IDs.
`CAMERA_DATASET_VERSION` currently uses the independent value `1.0.0`.

## Provenance and contribution rules

Sensors, cameras, and recording modes reference shared `CameraProvenance`
records. A source records its type, manufacturer, document title, URL,
revision, publication/access dates, firmware relevance, notes, and verification
status. Every factual camera, sensor, and mode record requires at least one
known source reference.

Future population should prefer official manufacturer specifications, manuals,
recording tables, and firmware documents. Community values are not verified
manufacturer facts. Do not infer an exact active aperture from marketing terms
such as Full Frame or Super 35, or from recorded pixel dimensions alone.
Output-specific conditions may include codec, recording resolution, media,
camera configuration, license, and firmware/SUP context. A single camera-level
maximum FPS is not an adequate substitute when the source provides conditional
limits.

## Registry and reproducibility

`CameraRegistry` is framework-independent and provides manufacturer lookup,
camera lookup, recording-mode lookup, and recording-output lookup.
`resolveCaptureSelection()` copies the dataset version, stable IDs, resolved
active aperture, and (when selected) output geometry into a small factual
snapshot. A future `CameraDocument` should persist that snapshot with its
stable camera/mode references so a correction in Dataset v3 cannot silently
change framing in an older project.

Milestone 2.5B adds exactly two verified production records in
`src/cameras/data/arri.ts`: ARRI ALEXA Mini LF and ARRI ALEXA 35. They remain
separate from `src/cameras/testFixtures.ts`. No camera UI, Stage camera, or
project camera document consumes this data yet.
