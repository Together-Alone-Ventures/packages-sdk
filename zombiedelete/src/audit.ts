export { buildAuditorToken } from '@together-alone/zombiedelete-core';

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
