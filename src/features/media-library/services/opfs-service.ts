import type {
  OPFSWorkerMessage,
  OPFSWorkerResponse,
} from '../workers/opfs-worker';

/**
 * OPFS Service - Wrapper for OPFS worker communication
 *
 * Provides a Promise-based API for file operations, hiding the complexity
 * of worker communication using MessageChannel pattern.
 */
export class OPFSService {
  private worker: Worker | null = null;

  /**
   * Initialize the OPFS worker
   */
  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/opfs-worker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return this.worker;
  }

  /**
   * Send a message to the worker and wait for response
   */
  private async sendMessage<T = unknown>(
    message: OPFSWorkerMessage
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event: MessageEvent<OPFSWorkerResponse>) => {
        if (event.data.success) {
          resolve(event.data.data as T);
        } else {
          reject(new Error(event.data.error || 'OPFS operation failed'));
        }
      };

      this.getWorker().postMessage(message, [channel.port2]);
    });
  }

  /**
   * Save a file to OPFS
   */
  async saveFile(path: string, data: ArrayBuffer): Promise<void> {
    await this.sendMessage({
      type: 'save',
      payload: { path, data },
    });
  }

  /**
   * Get a file from OPFS
   */
  async getFile(path: string): Promise<ArrayBuffer> {
    const data = await this.sendMessage<ArrayBuffer>({
      type: 'get',
      payload: { path },
    });

    return data;
  }

  /**
   * Delete a file from OPFS
   */
  async deleteFile(path: string): Promise<void> {
    await this.sendMessage({
      type: 'delete',
      payload: { path },
    });
  }

  /**
   * List files in a directory
   */
  async listFiles(directory: string): Promise<string[]> {
    const files = await this.sendMessage<string[]>({
      type: 'list',
      payload: { directory },
    });

    return files;
  }

  /**
   * Get storage usage estimate
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usage: 0, quota: 0 };
    }

    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }

  /**
   * Terminate the worker (cleanup)
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
export const opfsService = new OPFSService();
