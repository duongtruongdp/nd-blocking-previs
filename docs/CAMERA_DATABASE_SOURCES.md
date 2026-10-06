# Camera Database Sources and Mode Audit

Research snapshot: **2026-10-06**. This is the per-body audit behind the V2
camera selector. A mode is included only when its recording raster and active
capture geometry can be represented in the current FOV model. Codec, bitrate,
media, and bit-depth variants are metadata rather than duplicate geometry
modes.

## Audit classifications

- **Complete enough** — documented image windows important for blocking are represented.
- **Partial** — useful for blocking, but the official source does not expose every output/window as physical active dimensions.
- **Body only / insufficient** — no FOV-capable record is safe to add until a source documents the active area. None of the current 40 bodies is in this state.

## ARRI

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| ALEXA 35 Xtreme | [ARRI technical data](https://www.arri.com/en/cine-systems/cine-cameras/alexa-35-xtreme) | 4.6K 3:2, 4.6K/4K/3.8K 16:9, 3.8K 2.39, 3.3K 6:5, 2K/HD S16 | Output-only frame-rate/codec variants | Complete enough |
| ALEXA 35 | [ARRI technical data](https://www.arri.com/en/camera-systems/cameras/alexa-35) | 4.6K 3:2, 4.6K/4K/3.8K 16:9, 3.8K 2.39, 3.3K 6:5, 2K/HD S16 | Output-only variants | Complete enough |
| ALEXA 265 | [ARRI technical data](https://www.arri.com/en/cine-systems/cine-cameras/alexa-265) | 6.5K 2.12, 5.1K 1.65, 4.5K LF 3:2, 4K 16:9, 2.8K 2.39 | Output/FPS combinations | Complete enough |
| ALEXA 65 | [ARRI technical data](https://www.arri.com/en/camera-systems/cameras/alexa-65) | 6.5K 2.12 full active area | Other outputs lack separate physical windows | Partial |
| ALEXA Mini LF | [ARRI technical data](https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf) | LF 4.5K 3:2, 4.3K/3.8K 16:9, 2.39, 1:1, S35 3:2/16:9/4:3 | Output-only FPS/codec variants | Complete enough |
| ALEXA LF | [ARRI technical data](https://www.arri.com/en/cine-systems/cine-cameras/alexa-lf) | LF and S35 3:2/16:9, 2.39, 1:1 | Output-only variants | Complete enough |
| ALEXA Mini | [ARRI technical data](https://www.arri.com/en/camera-systems/cameras/alexa-mini) | Open Gate, HD/2K/3.2K/4K UHD, 4:3, 2K and HD anamorphic | Output-only variants | Complete enough |

## Sony

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| BURANO | [Sony BURANO](https://electronics.sony.com/imaging/cinema-line-cameras/burano) | 8.6K 3:2/16:9, 8.2K 17:9, 6K/5.8K S35 | Codec and frame-rate variants | Complete enough |
| FX5 | [Help Guide](https://helpguide.sony.net/ilc/2630/v1/en/contents/rec_format.html), [actual image sizes](https://helpguide.sony.net/ilc/2630/v1/en/contents/basic_action.html) | FF 5K 3:2/17:9/16:9, FFc 4.5K 17:9/16:9, FFc 3.8K 16:9, S35 3.2K 16:9 | Codec, HDMI format, and HFR variants do not create new geometry | Complete enough |
| FX6 | [Sony specifications](https://www.sony.com/electronics/support/camcorders-and-video-cameras-interchangeable-lens-camcorders/ilme-fx6v/specifications) | Full Frame 17:9/16:9 and S35 17:9 | Codec/FPS variants | Complete enough |
| FX3 | [Sony specifications](https://www.sony.com/electronics/support/interchangeable-lens-cameras-body/ilme-fx3/specifications) | Full Frame 16:9/17:9, S35 16:9 | Still-photo and codec variants | Complete enough |
| FX2 | [Sony FX2](https://electronics.sony.com/imaging/interchangeable-lens-cameras/all-interchangeable-lens-cameras/p/ilmefx2) | Full Frame and S35 16:9 | Codec/FPS variants | Partial |
| FX30 | [Sony specifications](https://www.sony.com/electronics/support/e-mount-body-ilme-fx-series/ilme-fx30/specifications) | S35 16:9/17:9 and open image area | Codec/FPS variants | Complete enough |
| VENICE 2 | [Sony VENICE 2](https://pro.sony/en_GB/products/digital-cinema-cameras/venice-2) | 8.6K 3:2/16:9, 8.2K 17:9, 6K/4K S35 | Codec, FPS, and sensor-generation variants | Complete enough |
| VENICE | [Sony VENICE](https://pro.sony/en_GB/products/digital-cinema-cameras/venice) | 6K full frame and 4K S35 | Codec/FPS variants | Partial |
| FR7 | [Sony FR7 specifications](https://www.sony.com/electronics/support/professional-cameras-interchangeable-lens-camcorders/ilme-fr7/specifications) | 4K full-frame 16:9 | No additional physical window published | Partial |

## RED

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| V-RAPTOR 8K VV | [RED V-RAPTOR guide](https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm) | 8K/6K/5K VV 17:9, 8K 2.4 | REDCODE/ISO/FPS combinations | Complete enough |
| V-RAPTOR 8K S35 | [RED V-RAPTOR guide](https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm) | 8K/6K/5K S35 17:9 | Codec/FPS variants | Complete enough |
| V-RAPTOR XL 8K VV | [RED V-RAPTOR XL guide](https://docs.red.com/955-0227/955-0227_V1.7_Rev-C_RED_PS%2C_V-RAPTOR_XL_%5BX%5D8K_VV_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR_XL.htm) | 8K VV 17:9 | Other outputs not separately documented as active areas | Partial |
| KOMODO-X | [RED KOMODO-X guide](https://docs.red.com/955-0219/955-0219_V2.0%20Rev-B%20RED%20PS%2C%20KOMODO-X%20Operation%20Guide%20HTML/Content/C_TechSpecs/Specs_KOMODO-X.htm) | 6K/5K/4K 17:9, 2K 16:9 | Codec/FPS variants | Complete enough |
| KOMODO 6K | [RED KOMODO guide](https://docs.red.com/955-0190_v1.3/955-0190_v1.3_REV-01_2_RED_PS_KOMODO_Operation_Guide.pdf) | 6K 17:9 | Lower outputs lack documented physical crop | Partial |

## Canon

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| EOS C400 | [Canon C400](https://www.usa.canon.com/shop/p/eos-c400) | 6K full frame and 4K S35 | Codec/FPS variants | Partial |
| EOS C80 | [Canon C80](https://www.usa.canon.com/shop/p/eos-c80) | 6K full frame and 4K S35 crop | Codec/FPS variants | Partial |
| EOS C50 | [Canon C50](https://www.usa.canon.com/shop/p/eos-c50) | 7K open gate and 4K 16:9 | Codec/FPS variants | Partial |
| EOS C70 | [Canon C70](https://www.usa.canon.com/shop/p/eos-c70) | 4K S35 | No additional active window published | Partial |
| EOS C500 Mark II | [Canon C500 Mark II](https://www.usa.canon.com/shop/p/eos-c500-mark-ii) | 5.9K full frame and 4K S35 | Codec/FPS variants | Partial |
| EOS C300 Mark III | [Canon C300 Mark III](https://www.usa.canon.com/shop/p/eos-c300-mark-iii) | 4K S35 and 2K S16 | Codec/FPS variants | Complete enough |
| EOS R5 C | [Canon R5 C](https://www.usa.canon.com/shop/p/eos-r5-c) | 8K full frame 16:9 | Other raster variants not active-window records | Partial |

## Blackmagic Design

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| URSA Cine 17K 65 | [URSA Cine specs](https://www.blackmagicdesign.com/products/blackmagicursacine/techspecs) | 17K 3:2 open gate | Other resolutions lack verified 65 mm active geometry | Partial |
| URSA Cine 12K LF | [URSA Cine 12K modes](https://www.blackmagicdesign.com/nz/products/blackmagicursacine/techspecs/W-URSA-62) | 12K and 9K 3:2 | Remaining rasters need variant-specific active dimensions | Partial |
| PYXIS 12K | [PYXIS specs](https://www.blackmagicdesign.com/products/blackmagicpyxis/techspecs) | 12K full-frame 3:2 | Other rasters need published active dimensions | Partial |
| PYXIS 6K | [PYXIS specs](https://www.blackmagicdesign.com/products/blackmagicpyxis/techspecs) | 6K full-frame 3:2 | Other rasters need published active dimensions | Partial |
| Cinema Camera 6K | [Cinema Camera 6K specs](https://www.blackmagicdesign.com/products/blackmagiccinemacamera/techspecs) | 6K open gate 3:2 | Other rasters need published active dimensions | Partial |
| URSA Mini Pro 12K | [URSA Mini Pro specs](https://www.blackmagicdesign.com/ae/products/blackmagicursaminipro/techspecs/W-URSA-40) | 12K 17:9 and S16 crop | Other rasters lack independently published active crop dimensions | Partial |

## Panasonic / LUMIX

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| BS1H | [LUMIX BS1H](https://www.panasonic.com/in/consumer/cameras-camcorders/camera/lumix-box-style-cameras/dc-bs1h.html) | 6K full area 3:2 and S35 4K | Codec/FPS variants | Partial |
| BGH1 | [LUMIX BGH1](https://www.panasonic.com/global/consumer/lumix/bgh1.html) | 4K MFT 16:9 | Other outputs omitted | Partial |
| AU-EVA1 | [AU-EVA1](https://pro-av.panasonic.net/en/eva1/) | 5.7K S35 and 4K 17:9 | Codec/FPS variants | Partial |
| S1H | [LUMIX S1H](https://www.panasonic.com/global/consumer/lumix/s1h.html) | 6K full area 3:2 and S35 4K | Codec/FPS variants | Partial |

## DJI

| Camera | Official source | Modes found / included | Omitted / reason | Status |
|---|---|---|---|---|
| Ronin 4D X9-8K | [Ronin 4D specs](https://www.dji.com/ronin-4d/specs) | 8K 17:9 and 2.39 full frame | Codec/FPS variants | Complete enough |
| Ronin 4D X9-6K | [Ronin 4D specs](https://www.dji.com/ronin-4d/specs) | 6K 17:9 and 4K S35 2.39 | Codec/FPS variants | Complete enough |

## Anamorphic source note

Sony’s FX5 Help Guide lists onboard monitor desqueeze factors of 1.3x,
1.5x, 1.6x, 1.8x, and 2.0x. Those values are stored as optional monitor
metadata on the FX5; the planning tool also permits the generic 1.33x factor.
They do not change physical sensor dimensions or create extra capture modes.
