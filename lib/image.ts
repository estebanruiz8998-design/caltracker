"use client";

/**
 * Downscale an image file on-device before upload: caps the long edge and
 * re-encodes as JPEG. Keeps API payloads small and token costs low.
 */
export async function resizeImage(
  file: File,
  maxEdge: number,
  quality = 0.82,
): Promise<{ dataUrl: string; base64: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, base64: dataUrl.split(",")[1] };
  } finally {
    bitmap.close();
  }
}
