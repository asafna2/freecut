/**
 * Codec Support Detection
 *
 * Detects which video/audio codecs can be decoded via WebCodecs (fast path)
 * versus requiring FFmpeg.wasm fallback.
 */

/**
 * Video codec identifiers
 */
export type VideoCodec =
  | 'h264'
  | 'h265'
  | 'vp8'
  | 'vp9'
  | 'av1'
  | 'prores'
  | 'dnxhd'
  | 'mjpeg'
  | 'mpeg2'
  | 'mpeg4'
  | 'theora'
  | 'unknown';

/**
 * Audio codec identifiers
 */
export type AudioCodec =
  | 'aac'
  | 'mp3'
  | 'opus'
  | 'vorbis'
  | 'flac'
  | 'pcm'
  | 'ac3'
  | 'eac3'
  | 'alac'
  | 'unknown';

/**
 * Decoder path for a codec
 */
export type DecoderPath = 'webcodecs' | 'ffmpeg' | 'unsupported';

/**
 * Codec support result
 */
interface CodecSupportResult {
  codec: VideoCodec | AudioCodec;
  supported: boolean;
  decoderPath: DecoderPath;
  hardwareAccelerated?: boolean;
}

/**
 * WebCodecs support check result
 */
interface WebCodecsSupport {
  available: boolean;
  videoDecoder: boolean;
  audioDecoder: boolean;
  videoEncoder: boolean;
  audioEncoder: boolean;
}

/**
 * Common codec strings for WebCodecs
 */
const WEBCODECS_VIDEO_CONFIGS: Record<VideoCodec, string | null> = {
  h264: 'avc1.42E01E', // H.264 Baseline Profile Level 3.0
  h265: 'hvc1.1.6.L93.B0', // HEVC Main Profile Level 3.1
  vp8: 'vp8',
  vp9: 'vp09.00.10.08', // VP9 Profile 0
  av1: 'av01.0.04M.08', // AV1 Main Profile Level 3.0
  prores: null, // Not supported by WebCodecs
  dnxhd: null, // Not supported by WebCodecs
  mjpeg: null, // Limited support
  mpeg2: null, // Not supported by WebCodecs
  mpeg4: null, // Part 2 not supported
  theora: null, // Not supported by WebCodecs
  unknown: null,
};

const WEBCODECS_AUDIO_CONFIGS: Record<AudioCodec, string | null> = {
  aac: 'mp4a.40.2', // AAC-LC
  mp3: 'mp3',
  opus: 'opus',
  vorbis: 'vorbis',
  flac: 'flac',
  pcm: null, // Raw PCM, handle directly
  ac3: null, // Not in WebCodecs
  eac3: null, // Not in WebCodecs
  alac: null, // Apple Lossless - limited support
  unknown: null,
};

/**
 * Check if WebCodecs API is available
 */
export function checkWebCodecsSupport(): WebCodecsSupport {
  const hasVideoDecoder = typeof VideoDecoder !== 'undefined';
  const hasAudioDecoder = typeof AudioDecoder !== 'undefined';
  const hasVideoEncoder = typeof VideoEncoder !== 'undefined';
  const hasAudioEncoder = typeof AudioEncoder !== 'undefined';

  return {
    available: hasVideoDecoder || hasAudioDecoder,
    videoDecoder: hasVideoDecoder,
    audioDecoder: hasAudioDecoder,
    videoEncoder: hasVideoEncoder,
    audioEncoder: hasAudioEncoder,
  };
}

/**
 * Check if a specific video codec is supported by WebCodecs
 */
export async function checkVideoCodecSupport(codec: VideoCodec): Promise<CodecSupportResult> {
  const codecString = WEBCODECS_VIDEO_CONFIGS[codec];

  // No WebCodecs string means FFmpeg required
  if (!codecString) {
    return {
      codec,
      supported: true, // Supported via FFmpeg
      decoderPath: 'ffmpeg',
    };
  }

  // Check if WebCodecs is available
  if (typeof VideoDecoder === 'undefined') {
    return {
      codec,
      supported: true,
      decoderPath: 'ffmpeg',
    };
  }

  try {
    const support = await VideoDecoder.isConfigSupported({
      codec: codecString,
      codedWidth: 1920,
      codedHeight: 1080,
    });

    if (support.supported) {
      return {
        codec,
        supported: true,
        decoderPath: 'webcodecs',
        hardwareAccelerated: support.config?.hardwareAcceleration === 'prefer-hardware',
      };
    }
  } catch {
    // isConfigSupported threw, fall back to FFmpeg
  }

  return {
    codec,
    supported: true,
    decoderPath: 'ffmpeg',
  };
}

/**
 * Check if a specific audio codec is supported by WebCodecs
 */
export async function checkAudioCodecSupport(codec: AudioCodec): Promise<CodecSupportResult> {
  const codecString = WEBCODECS_AUDIO_CONFIGS[codec];

  // PCM is handled directly without decoder
  if (codec === 'pcm') {
    return {
      codec,
      supported: true,
      decoderPath: 'webcodecs', // Native handling
    };
  }

  // No WebCodecs string means FFmpeg required
  if (!codecString) {
    return {
      codec,
      supported: true,
      decoderPath: 'ffmpeg',
    };
  }

  // Check if WebCodecs is available
  if (typeof AudioDecoder === 'undefined') {
    return {
      codec,
      supported: true,
      decoderPath: 'ffmpeg',
    };
  }

  try {
    const support = await AudioDecoder.isConfigSupported({
      codec: codecString,
      sampleRate: 48000,
      numberOfChannels: 2,
    });

    if (support.supported) {
      return {
        codec,
        supported: true,
        decoderPath: 'webcodecs',
      };
    }
  } catch {
    // isConfigSupported threw, fall back to FFmpeg
  }

  return {
    codec,
    supported: true,
    decoderPath: 'ffmpeg',
  };
}

/**
 * Get the recommended decoder path for a video codec
 */
export function getVideoDecoderPath(codec: VideoCodec): DecoderPath {
  // Codecs that WebCodecs typically supports
  const webCodecsCodecs: VideoCodec[] = ['h264', 'vp8', 'vp9', 'av1'];

  if (webCodecsCodecs.includes(codec)) {
    return 'webcodecs';
  }

  // Codecs requiring FFmpeg
  const ffmpegCodecs: VideoCodec[] = ['prores', 'dnxhd', 'h265', 'mpeg2', 'theora'];

  if (ffmpegCodecs.includes(codec)) {
    return 'ffmpeg';
  }

  return 'ffmpeg'; // Default to FFmpeg for unknown
}

/**
 * Get the recommended decoder path for an audio codec
 */
export function getAudioDecoderPath(codec: AudioCodec): DecoderPath {
  // Codecs that WebCodecs typically supports
  const webCodecsCodecs: AudioCodec[] = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm'];

  if (webCodecsCodecs.includes(codec)) {
    return 'webcodecs';
  }

  // Codecs requiring FFmpeg
  const ffmpegCodecs: AudioCodec[] = ['ac3', 'eac3', 'alac'];

  if (ffmpegCodecs.includes(codec)) {
    return 'ffmpeg';
  }

  return 'ffmpeg';
}

/**
 * Parse codec string from container metadata
 */
export function parseVideoCodec(codecString: string): VideoCodec {
  const lower = codecString.toLowerCase();

  if (lower.includes('avc') || lower.includes('h264') || lower.includes('h.264')) {
    return 'h264';
  }
  if (lower.includes('hevc') || lower.includes('h265') || lower.includes('h.265') || lower.includes('hvc1')) {
    return 'h265';
  }
  if (lower.includes('vp8')) {
    return 'vp8';
  }
  if (lower.includes('vp9') || lower.includes('vp09')) {
    return 'vp9';
  }
  if (lower.includes('av1') || lower.includes('av01')) {
    return 'av1';
  }
  if (lower.includes('prores') || lower.includes('apch') || lower.includes('apcn') || lower.includes('apcs')) {
    return 'prores';
  }
  if (lower.includes('dnxh') || lower.includes('avdh')) {
    return 'dnxhd';
  }
  if (lower.includes('mjpeg') || lower.includes('mjpg')) {
    return 'mjpeg';
  }
  if (lower.includes('mpeg2') || lower.includes('mp2v')) {
    return 'mpeg2';
  }
  if (lower.includes('mpeg4') || lower.includes('mp4v') || lower.includes('divx') || lower.includes('xvid')) {
    return 'mpeg4';
  }
  if (lower.includes('theora')) {
    return 'theora';
  }

  return 'unknown';
}

/**
 * Parse audio codec string from container metadata
 */
export function parseAudioCodec(codecString: string): AudioCodec {
  const lower = codecString.toLowerCase();

  if (lower.includes('aac') || lower.includes('mp4a')) {
    return 'aac';
  }
  if (lower.includes('mp3') || lower.includes('mp3a') || lower.includes('mpeg audio')) {
    return 'mp3';
  }
  if (lower.includes('opus')) {
    return 'opus';
  }
  if (lower.includes('vorbis')) {
    return 'vorbis';
  }
  if (lower.includes('flac')) {
    return 'flac';
  }
  if (lower.includes('pcm') || lower.includes('lpcm') || lower.includes('raw')) {
    return 'pcm';
  }
  // Check E-AC3 before AC3 (eac3 contains ac3)
  if (lower.includes('eac3') || lower.includes('ec-3') || lower.includes('e-ac-3')) {
    return 'eac3';
  }
  if (lower.includes('ac-3') || lower.includes('ac3') || (lower.includes('a52') && !lower.includes('ea'))) {
    return 'ac3';
  }
  if (lower.includes('alac')) {
    return 'alac';
  }

  return 'unknown';
}

/**
 * Check all common codecs and return support map
 */
export async function checkAllCodecSupport(): Promise<{
  video: Map<VideoCodec, CodecSupportResult>;
  audio: Map<AudioCodec, CodecSupportResult>;
}> {
  const videoCodecs: VideoCodec[] = ['h264', 'h265', 'vp8', 'vp9', 'av1', 'prores', 'dnxhd'];
  const audioCodecs: AudioCodec[] = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3'];

  const videoResults = new Map<VideoCodec, CodecSupportResult>();
  const audioResults = new Map<AudioCodec, CodecSupportResult>();

  await Promise.all([
    ...videoCodecs.map(async (codec) => {
      const result = await checkVideoCodecSupport(codec);
      videoResults.set(codec, result);
    }),
    ...audioCodecs.map(async (codec) => {
      const result = await checkAudioCodecSupport(codec);
      audioResults.set(codec, result);
    }),
  ]);

  return { video: videoResults, audio: audioResults };
}
