/**
 * Réduit une photo avant envoi (côté plus long 1280 px, JPEG qualité 0,7) :
 * une photo de 4 Mo devient ~150 Ko, essentiel avec une connexion lente et une data chère.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.7): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob && blob.size < file.size ? blob : file;
}
