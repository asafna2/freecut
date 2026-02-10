/**
 * GPU media module entry points used by hooks/tests.
 */

export type { DecodedVideoFrame } from './types';

export {
  ManagedMediaSource,
  MediaSourceManager,
  createMediaSourceManager,
} from './media-source-manager';

export {
  TextureImporter,
  createTextureImporter,
  type ImportedTexture,
} from './texture-import';
