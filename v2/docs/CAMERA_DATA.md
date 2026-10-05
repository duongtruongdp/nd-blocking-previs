# V2 Camera Data

The V2 camera database is a small verified seed set for blocking and previs. It is intentionally separate from `SceneDocument`: a scene stores stable definition and capture-mode IDs, while the runtime resolves those IDs into physical capture geometry.

Each camera body and capture mode carries a manufacturer source, title, URL, access date, and notes. The initial records use the following official references:

- [ARRI ALEXA 35](https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35)
- [ARRI ALEXA Mini LF](https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf)
- [ARRI ALEXA LF](https://www.arri.com/en/cine-systems/cine-cameras/alexa-lf)
- [Blackmagic PYXIS technical specifications](https://www.blackmagicdesign.com/products/blackmagicpyxis/techspecs/W-BOX-01)
- [RED V-RAPTOR operation guide](https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm)

Capture modes keep these values distinct:

- physical sensor size
- active capture area used for projection
- recording resolution
- frame-rate capability where verified

The PYXIS seed intentionally contains only its documented full-sensor Open Gate mode. Crop modes whose physical active dimensions were not explicitly available in the source are not guessed. The database can grow later without changing the serializable camera contract.
