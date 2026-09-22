import sharp from "sharp";
const MAX_BYTES = 2 * 1024 * 1024;

export async function decodePng(value) {
  if (typeof value !== "string" || !value) throw new Error("missing_png");
  const base64 = value.replace(/^data:image\/png;base64,/, "");
  if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error("png_too_large");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error("not_a_png");
  }
  const input = Buffer.from(base64, "base64");
  if (input.length > MAX_BYTES) throw new Error("png_too_large");
  if (!input.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("not_a_png");
  let metadata;
  const image = sharp(input, { failOn: "warning", limitInputPixels: 384 * 2000 });
  try { metadata = await image.metadata(); } catch { throw new Error("not_a_png"); }
  if (metadata.format !== "png" || (metadata.pages || 1) !== 1) throw new Error("not_a_png");
  if (metadata.width !== 384) throw new Error("bad_width");
  if (metadata.height < 240 || metadata.height > 2000) throw new Error("bad_height");
  let buf;
  // Fully decode pixels and produce a fresh, metadata-free PNG.
  try { buf = await image.png().toBuffer(); } catch { throw new Error("not_a_png"); }
  if (buf.length > MAX_BYTES) throw new Error("png_too_large");
  return { buf, width: metadata.width, height: metadata.height };
}
