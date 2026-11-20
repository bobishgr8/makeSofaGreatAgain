// Photos are redrawn on a canvas before upload. The canvas keeps only the
// pixels, so the file's metadata (EXIF: GPS position of the donor's home,
// camera, time) never reaches Storage, where listings show photos publicly.
// It also shrinks multi-megabyte phone photos.

const MAX_SIDE = 1600;
const QUALITY = 0.85;

export class PhotoReadError extends Error {}

export async function prepareForUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the EXIF rotation before the metadata is dropped.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Refuse rather than upload the original with its metadata.
    throw new PhotoReadError(
      `We couldn't read "${file.name}". Please use a JPEG or PNG photo.`,
    );
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoReadError("Your browser couldn't prepare the photos.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new PhotoReadError("Your browser couldn't prepare the photos.")),
      "image/jpeg",
      QUALITY,
    ),
  );
}
