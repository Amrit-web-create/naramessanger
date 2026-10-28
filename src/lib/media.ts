export async function shrinkImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  if (file.size > 8_000_000) throw new Error("too-big");
  const bitmap = await createImageBitmap(file);
  const max = 640;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.68);
  if (url.length > 140_000) throw new Error("too-big");
  return url;
}
