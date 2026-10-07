# Bundled FFmpeg sidecar

The Apple Silicon sidecar `ffmpeg-aarch64-apple-darwin` is built from FFmpeg
7.1.1 with this configuration:

```text
--disable-gpl --disable-nonfree --disable-everything --enable-ffmpeg
--enable-small --enable-videotoolbox --enable-encoder=h264_videotoolbox
--enable-decoder=png,hevc --enable-demuxer=image2 --enable-muxer=mp4
--enable-protocol=file,pipe --enable-filter=scale,format --enable-parser=h264
--enable-bsf=h264_mp4toannexb
```

The resulting program reports **LGPL version 2.1 or later**. It does not link
libx264 or other GPL/nonfree components. FFmpeg source and license information
are available from https://ffmpeg.org/; release packaging must retain the
applicable LGPL notices and source-offer obligations.

This repository currently contains the macOS arm64 sidecar used by the
Apple-Silicon desktop target. Windows sidecars must be built separately for
their exact Tauri target triple and must pass the same licensing review before
being shipped.
