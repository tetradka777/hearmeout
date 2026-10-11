// A picked photo, shrunk on the device before upload: the avatar is stored
// inline and sent with every profile and friend list, so a 5 MB phone photo
// (7 MB as base64) made all of those slow. Centre-cropped to a square of
// `side` pixels, as JPEG (a few tens of KB). Null if the browser can't read
// the file as an image.
export async function squareImageDataUrl(file: File, side = 256, quality = 0.85): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const s = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, side, side);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
