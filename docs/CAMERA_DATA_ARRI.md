# ARRI Batch 1 Dataset Review

Milestone 2.5B populates exactly two production cameras:

- ARRI ALEXA Mini LF
- ARRI ALEXA 35

No other manufacturer or ARRI camera is included. The data is stored in
[`src/cameras/data/arri.ts`](../src/cameras/data/arri.ts), outside UI
components and outside synthetic fixtures.

## Source register

All production facts use official ARRI sources, accessed 2026-10-04.

| Source | Revision/date | Use |
| --- | --- | --- |
| [ALEXA Mini LF technical data](https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf) | Current product page | Sensor, active areas, file containers, image content, rates |
| [ALEXA Mini LF FAQ](https://www.arri.com/en/learn-help/learn-help-camera-system/frequently-asked-questions/alexa-mini-lf) | Current FAQ | Downsampled LF 16:9 outputs and 2.8K 1:1 anamorphic context |
| [ALEXA Mini LF SUP 7.3 User Manual](https://www.arri.com/resource/blob/347174/6b8fd84caac842b3c9292c910fcee693/alexa-mini-lf-sup-7-3-user-manual-data.pdf) | SUP 7.3, applicable to SUP 7.3.2 | Current nine-mode inventory, output-specific FPS, and precise active geometry |
| [ALEXA Mini LF SUP 7.3.2](https://www.arri.com/en/technical-service/firmware/software-and-firmware-updates-for-cameras/alexa-mini-lf-sup-7-3-2) | 2025-06-12 | Current software context and release-note/manual relationship |
| [ALEXA Mini LF Recording Format Sheet](https://www.arri.com/resource/blob/261408/46205a6cdd14c7667b1bc9fc6e3a91a9/alexa-mini-lf-recording-format-sheet-din-a4-data.pdf) | 2021-12-20, SUP 7.1 | Recording-format cross-check |
| [ARRI Formats and Resolutions Overview](https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf) | V6.3, 2026-07-15 | Current cross-camera geometry, output, and frame-rate conditions |
| [ALEXA 35 technical data](https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35) | Current product page | Sensor, active areas, recording formats, anamorphic license context |
| [ALEXA 35 SUP 6.1 User Manual](https://www.arri.com/resource/blob/406922/b3de0f288676a2665befd33a217fd524/alexa-35-sup-6-1-0-user-manual-en-data.pdf) | SUP 6.1.0, 2026-07-07 | Sensor-mode/output relationship, licenses, anamorphic workflow |
| [ALEXA 35 SUP 6.0.0 User Manual](https://www.arri.com/resource/blob/403596/9bca057cb6a962cff63484fd092e4b33/alexa-35-sup-6-0-0-user-manual-en-data.pdf) | SUP 6.0.0, 2026-04-15 | Historical HD S16 conflict reference; not active mode provenance |
| [ALEXA 35 Recording Formats Poster](https://www.arri.com/resource/blob/296424/812bdde50a7339a6748441a2983a90c9/alexa-35-recording-format-poster-data.pdf) | 2023-07-25 | Recording-format cross-check; superseded for current values by V6.3 |

Each camera, physical sensor, sensor mode, and recording output carries source
IDs. The validator rejects unknown source references and requires HTTP(S) URLs
for production provenance.

## Data model review

The Mini LF and ALEXA 35 both demonstrate why a mode cannot be represented as
one pixel rectangle. For example, the Mini LF 4.3K LF 16:9 sensor mode uses
4320 × 2430 photosites but can produce UHD and HD ProRes outputs. The ALEXA 35
4K 16:9 mode has one active sensor area and separate 4K, UHD, 2K, and HD
outputs. These are represented as one `RecordingMode` with multiple
`RecordingOutput` records.

Frame rates are exact rational ranges beginning at 0.75 fps where the ARRI
source describes that range. ALEXA 35 output rates retain separate media
conditions such as Compact Drive 1TB and Compact Drive 2TB. Source notation is
also preserved in output notes where ARRI publishes paired or three-column
limits that should not be flattened into one universal camera maximum.

The dataset stores manufacturer facts only. Capture aspect ratio, active
diagonal, FOV, centered delivery crops, and distance coverage remain derived
by `src/math/cinematography.ts`. Anamorphic metadata records only official
workflow intent/orientation; it does not apply lens squeeze to the physical
sensor geometry.

The current dataset includes nine verified Mini LF modes and nine original
ALEXA 35 sensor modes. ALEXA 35 3.8K 2.39:1 is represented as a ProRes output
of the original 3.3K 6:5 mode, not as a separate sensor mode. The original
ALEXA 35 dataset retains 2K 16:9 S16; it does not create an HD S16 sensor mode.
Image-circle values are deliberately not copied into the production record
because the current schema does not need a manufacturer image-circle fact for
the requested milestone.

## Official Source Reconciliation

This reconciliation uses the current camera-specific manuals/SUP context first,
then ARRI's current formats overview, recording-format documents, and product
pages. The result is intentionally narrower than the union of every historical
or model-family table.

| Camera | Field / mode | Older or lower-precedence source | Newer or preferred source | Chosen current value | Reason |
| --- | --- | --- | --- | --- | --- |
| Mini LF | 4.5K LF 1.89:1 | Prompt claim: 4448 × 2574, 36.70 × 21.23 mm, ARRIRAW 4448 × 2346, 50 fps; not accepted as evidence | [SUP 7.3 User Manual](https://www.arri.com/resource/blob/347174/6b8fd84caac842b3c9292c910fcee693/alexa-mini-lf-sup-7-3-user-manual-data.pdf) and [SUP 7.3.2](https://www.arri.com/en/technical-service/firmware/software-and-firmware-updates-for-cameras/alexa-mini-lf-sup-7-3-2) | Omitted; 9 verified sensor modes | The manual documents nine modes and contains no 1.89:1 mode, so the unverified claim is not imported. |
| Mini LF | 4.3K LF 16:9 UHD FPS | [Current product table](https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf): 48 fps | [SUP 7.3 User Manual](https://www.arri.com/resource/blob/347174/6b8fd84caac842b3c9292c910fcee693/alexa-mini-lf-sup-7-3-user-manual-data.pdf): UHD 40 fps, HD 75 fps | UHD ProRes 40 fps; HD ProRes 75 fps | The current camera-specific manual is preferred and rates are attached to each output. The product-table conflict is retained in the output note. |
| Mini LF | S35 active geometry | [Formats Overview V6.3](https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf): rounded 18.17 / 17.82 / 13.37 mm values | [SUP 7.3 User Manual](https://www.arri.com/resource/blob/347174/6b8fd84caac842b3c9292c910fcee693/alexa-mini-lf-sup-7-3-user-manual-data.pdf): 18.16 / 17.81 / 13.36 mm | SUP manual geometry | The camera-specific manual wins under the stated source precedence. |
| Original ALEXA35 | 3.8K 2.39:1 | Xtreme table in [Formats Overview V6.3](https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf): separate sensor-mode presentation | [Original ALEXA35 technical data](https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35) and the original-model V6.3 table | ProRes output under original 3.3K 6:5; not a sensor mode | The original-model records place this as an output, while the Xtreme table is a separate camera identity. |
| Original ALEXA35 | HD S16 | Xtreme table in [Formats Overview V6.3](https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf) and historical [SUP 6.0.0 manual](https://www.arri.com/resource/blob/403596/9bca057cb6a962cff63484fd092e4b33/alexa-35-sup-6-0-0-user-manual-en-data.pdf) | [Original ALEXA35 technical data](https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35) and the original-model V6.3 table: 2K 16:9 S16 | 2K 16:9 S16 sensor mode; no HD S16 sensor mode | The current original-model records govern this Batch 1 dataset. HD remains an output of 4K 16:9 rather than creating a duplicate sensor readout. |
| ALEXA35 identity | Original ALEXA35 vs Xtreme | Xtreme-specific tables and product page | Original ALEXA35 product data, SUP 6.1 context, and original-model V6.3 table | Original ALEXA35 only; no Xtreme sources attached | The dataset must not establish an original-camera capability from Xtreme-only provenance. |

The audit report exposes the selected firmware/SUP context and source IDs on
the camera, physical-sensor, sensor-mode, and recording-output records. This
keeps sensor mode, recording output, codec/container, and FPS/media conditions
reviewable without flattening them into one camera maximum.

## Deterministic review

`formatCameraDatasetAudit(ARRI_CAMERA_DATASET)` produces a stable text report
with camera, physical sensor, sensor mode, active dimensions, photosites,
outputs, FPS conditions, and source IDs. The production dataset test asserts
representative report content and verifies that no synthetic fixture appears.

## Known limitations

- Camera UI, lens selection, frame guides, Camera View, timeline, project
  serialization, and export do not consume this dataset yet.
- The ALEXA 35 source publishes media/configuration FPS notation in compact
  tables; the dataset preserves the official notation in conditions and notes
  rather than inventing a discrete-rate list.
- Some ARRI tables are model-family or historical documents. The source
  reconciliation above records the Mini LF 4.3K UHD conflict and the original
  ALEXA35/Xtreme HD S16 and 3.8K 2.39:1 distinction instead of silently
  merging the tables.
- Image circle, pixel pitch, and other optional manufacturer facts are omitted
  where they are not required by the current data contract.
