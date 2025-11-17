/**
 * OPFS Worker - Web Worker for high-performance file operations
 *
 * Uses the synchronous FileSystemSyncAccessHandle API for maximum performance.
 * This API is only available in Web Workers.
 *
 * File structure: media/{uuid}/{filename}
 */

export interface OPFSWorkerMessage {
  type: 'save' | 'get' | 'delete' | 'list';
  payload: {
    path?: string;
    data?: ArrayBuffer;
    directory?: string;
  };
}

export interface OPFSWorkerResponse {
  success: boolean;
  data?: ArrayBuffer | string[];
  error?: string;
}

let opfsRoot: FileSystemDirectoryHandle | null = null;

/**
 * Initialize OPFS root directory
 */
async function initOPFS(): Promise<FileSystemDirectoryHandle> {
  if (!opfsRoot) {
    opfsRoot = await navigator.storage.getDirectory();
  }
  return opfsRoot;
}

/**
 * Navigate to a file's directory, creating directories as needed
 */
async function navigateToDirectory(
  path: string
): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
  const root = await initOPFS();
  const parts = path.split('/').filter((p) => p);

  if (parts.length === 0) {
    throw new Error('Invalid path');
  }

  let dir = root;

  // Navigate through directories (all parts except the last which is the filename)
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];

  return { dir, fileName };
}

/**
 * Write a file to OPFS using synchronous access handle
 */
async function saveFile(path: string, data: ArrayBuffer): Promise<void> {
  const { dir, fileName } = await navigateToDirectory(path);

  // Get file handle (create if doesn't exist)
  const fileHandle = await dir.getFileHandle(fileName, { create: true });

  // Use synchronous API for maximum performance
  const syncHandle = await fileHandle.createSyncAccessHandle();

  try {
    const buffer = new Uint8Array(data);

    // Truncate file to 0 (clear existing content)
    syncHandle.truncate(0);

    // Write data
    syncHandle.write(buffer, { at: 0 });

    // Ensure data is persisted to disk
    syncHandle.flush();
  } finally {
    // Always close the handle
    syncHandle.close();
  }
}

/**
 * Read a file from OPFS
 */
async function getFile(path: string): Promise<ArrayBuffer> {
  const { dir, fileName } = await navigateToDirectory(path);

  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const syncHandle = await fileHandle.createSyncAccessHandle();

    try {
      const size = syncHandle.getSize();
      const buffer = new ArrayBuffer(size);
      syncHandle.read(buffer, { at: 0 });
      return buffer;
    } finally {
      syncHandle.close();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      throw new Error(`File not found: ${path}`);
    }
    throw error;
  }
}

/**
 * Delete a file from OPFS
 */
async function deleteFile(path: string): Promise<void> {
  const { dir, fileName } = await navigateToDirectory(path);

  try {
    await dir.removeEntry(fileName);
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      // File doesn't exist, consider it deleted
      return;
    }
    throw error;
  }
}

/**
 * List all files in a directory
 */
async function listFiles(directory: string): Promise<string[]> {
  const root = await initOPFS();
  const parts = directory.split('/').filter((p) => p);

  let dir = root;

  // Navigate to the target directory
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Directory doesn't exist, return empty list
        return [];
      }
      throw error;
    }
  }

  // List all files in the directory
  const files: string[] = [];

  // @ts-expect-error - TypeScript doesn't have full OPFS types yet
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      files.push(name);
    }
  }

  return files;
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<OPFSWorkerMessage>) => {
  const { type, payload } = event.data;
  const port = event.ports[0];

  if (!port) {
    console.error('No message port provided');
    return;
  }

  let response: OPFSWorkerResponse;

  try {
    switch (type) {
      case 'save':
        if (!payload.path || !payload.data) {
          throw new Error('Missing path or data for save operation');
        }
        await saveFile(payload.path, payload.data);
        response = { success: true };
        break;

      case 'get':
        if (!payload.path) {
          throw new Error('Missing path for get operation');
        }
        const data = await getFile(payload.path);
        response = { success: true, data };
        break;

      case 'delete':
        if (!payload.path) {
          throw new Error('Missing path for delete operation');
        }
        await deleteFile(payload.path);
        response = { success: true };
        break;

      case 'list':
        if (!payload.directory) {
          throw new Error('Missing directory for list operation');
        }
        const files = await listFiles(payload.directory);
        response = { success: true, data: files };
        break;

      default:
        throw new Error(`Unknown action: ${type}`);
    }
  } catch (error) {
    response = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  port.postMessage(response);
};

// Export for TypeScript
export {};
