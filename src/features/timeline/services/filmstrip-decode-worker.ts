/**
 * Filmstrip Decode Worker
 *
 * Decodes JPEG blobs to ImageBitmaps off the main thread.
 * Uses parallel decoding for maximum throughput.
 * Transfers ImageBitmaps back via zero-copy transfer.
 */

export interface DecodeRequest {
  type: 'decode';
  requestId: string;
  frames: {
    index: number;
    timestamp: number;
    data: ArrayBuffer;
  }[];
}

export interface DecodeResponse {
  type: 'decoded';
  requestId: string;
  results: {
    index: number;
    timestamp: number;
    bitmap: ImageBitmap;
  }[];
}

export interface DecodeProgressResponse {
  type: 'progress';
  requestId: string;
  results: {
    index: number;
    timestamp: number;
    bitmap: ImageBitmap;
  }[];
  done: boolean;
}

export type WorkerMessage = DecodeRequest;
export type WorkerResponse = DecodeResponse | DecodeProgressResponse;

// Batch size for progressive updates
const DECODE_BATCH_SIZE = 20;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, requestId, frames } = event.data;

  if (type !== 'decode') return;

  const totalFrames = frames.length;

  // Process in batches for progressive updates
  for (let startIdx = 0; startIdx < totalFrames; startIdx += DECODE_BATCH_SIZE) {
    const endIdx = Math.min(startIdx + DECODE_BATCH_SIZE, totalFrames);
    const batch = frames.slice(startIdx, endIdx);

    // Decode all frames in batch in parallel
    const decodePromises = batch.map(async (frame) => {
      const blob = new Blob([frame.data], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      return {
        index: frame.index,
        timestamp: frame.timestamp,
        bitmap,
      };
    });

    const results = await Promise.all(decodePromises);
    const isDone = endIdx >= totalFrames;

    // Send progress update with transferable bitmaps
    const response: DecodeProgressResponse = {
      type: 'progress',
      requestId,
      results,
      done: isDone,
    };

    // Transfer ImageBitmaps (zero-copy)
    const transferables = results.map((r) => r.bitmap);
    self.postMessage(response, { transfer: transferables });
  }
};
