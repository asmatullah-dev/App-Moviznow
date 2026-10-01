/**
 * High-performance, zero-dependency string compression & decompression utility.
 * Uses native Web Streams CompressionStream / DecompressionStream with standard fallback.
 */

export const COMPRESSION_PREFIX = '__CMP_GZ__:';

/**
 * Compresses a UTF-8 string into a base64 encoded compressed string.
 */
export async function compressString(str: string): Promise<string> {
  if (!str || str.length < 1024) return str;

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
      const response = new Response(stream);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Convert binary to binary string in chunks to prevent stack overflow
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      return COMPRESSION_PREFIX + btoa(binary);
    } catch (e) {
      // Fallback to uncompressed on stream error
      return str;
    }
  }

  return str;
}

/**
 * Decompresses a previously compressed string. If not compressed, returns original string.
 */
export async function decompressString(str: string): Promise<string> {
  if (!str || typeof str !== 'string' || !str.startsWith(COMPRESSION_PREFIX)) {
    return str;
  }

  if (typeof DecompressionStream !== 'undefined') {
    try {
      const base64Data = str.slice(COMPRESSION_PREFIX.length);
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const response = new Response(stream);
      return await response.text();
    } catch (e) {
      console.warn('Decompression failed, returning raw payload', e);
      return str;
    }
  }

  return str;
}

/**
 * Synchronously checks if a string is in compressed format
 */
export function isCompressedString(str: any): boolean {
  return typeof str === 'string' && str.startsWith(COMPRESSION_PREFIX);
}
