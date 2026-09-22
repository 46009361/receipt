export const BARCODE_VALUE = "receipt.hackclub.com";

// Code 128 set B keeps the public URL in a compact, scanner-readable barcode.
// Each pattern alternates bar and space widths, beginning with a bar.
const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export function code128Modules(value = BARCODE_VALUE) {
  if (![...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126)) {
    throw new Error("Code 128 set B only supports printable ASCII text.");
  }

  const codes = [104, ...[...value].map((character) => character.charCodeAt(0) - 32)];
  const checksum = codes.reduce((total, code, index) => total + code * (index || 1), 0) % 103;
  return [...codes, checksum, 106].flatMap((code) => [...CODE_128_PATTERNS[code]].map(Number));
}

export function drawBarcode(ctx, x, y, width, height, value = BARCODE_VALUE) {
  const modules = code128Modules(value);
  const moduleWidth = width / modules.reduce((total, module) => total + module, 0);
  let cursor = x;
  let isBar = true;

  for (const module of modules) {
    const segmentWidth = module * moduleWidth;
    if (isBar) ctx.fillRect(cursor, y, segmentWidth, height);
    cursor += segmentWidth;
    isBar = !isBar;
  }
}

export function createBarcodeSvg(value = BARCODE_VALUE) {
  const modules = code128Modules(value);
  const totalWidth = modules.reduce((total, module) => total + module, 0);
  const quietZone = 10;
  let cursor = quietZone;
  let isBar = true;
  const bars = modules.map((module) => {
    const bar = isBar ? `<rect x="${cursor}" width="${module}" height="60"/>` : "";
    cursor += module;
    isBar = !isBar;
    return bar;
  }).join("");

  return `<svg viewBox="0 0 ${totalWidth + quietZone * 2} 76" role="img" aria-label="Barcode for ${value}" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor">${bars}</g><text x="${totalWidth / 2 + quietZone}" y="73" text-anchor="middle">${value}</text></svg>`;
}
