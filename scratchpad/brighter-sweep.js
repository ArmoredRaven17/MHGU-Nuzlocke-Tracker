// "Brighter" is not the same move as "lighter". Raising lightness alone walks a
// colour toward WHITE, so past ~70% it reads pastel rather than bright. Vivid
// wants saturation as well. Sweep both and look at what each does to the two
// things that constrain the palette: the contrast floor, and the two pairs that
// already sit under dE 10.
const fs = require("fs");
const src = fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/app.js", "utf8");
const g = (re) => src.match(re)[0];
const pre = [g(/const clamp = [^\n]+/), g(/const clamp01 = [^\n]+/), g(/const hexRgb = [^\n]+/),
  g(/function rgbToHsl[\s\S]*?\n  \}/), g(/function hslToRgb[\s\S]*?\n  \}/),
  g(/const shade = \(rgb, lo, hi\) => \{[\s\S]*?\n  \};/),
  g(/const lighten = \(rgb, b, minL\) => \{[\s\S]*?\n  \};/)].join("\n");
const { shade, hexRgb, rgbToHsl, hslToRgb, clamp01 } =
  new Function(pre + "; return {shade, hexRgb, rgbToHsl, hslToRgb, clamp01};")();

const hex = (rgb) => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const lab = ([r, gg, b]) => {
  const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
  const [R, G, B] = [f(r), f(gg), f(b)];
  let x = (R * .4124 + G * .3576 + B * .1805) / .95047;
  let y = (R * .2126 + G * .7152 + B * .0722);
  let z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
  const k = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  [x, y, z] = [k(x), k(y), k(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const dE = (a, b) => { const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const lum = ([r, gg, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
};
const cw = (rgb) => 1.05 / (lum(rgb) + 0.05);
const worstOf = (c) => Math.min(cw(shade(c, .10, .28)), cw(shade(c, .07, .19)), cw(shade(c, .17, .35)));

const BASES = [["Snowbaron", "#8E6BC4"], ["Stonefist", "#E8776E"], ["Dreadqueen", "#4A2A66"],
  ["Drilltusk", "#D07A20"], ["Silverwind", "#7A858E"], ["Crystalbeard", "#CFAE44"],
  ["Deadeye", "#3F7A2E"], ["Dreadking", "#3E0C05"], ["Grimclaw", "#3070D0"], ["Nightcloak", "#07143C"]];
const REDHELM = hexRgb("#CE2A20"), ELDERFROST = hexRgb("#B8C6CE");

// b lifts lightness as before; k multiplies saturation. k = 1 is the shipped rule.
const bright = (rgb, b, k) => {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, clamp01(s * k), clamp01(l + (1 - l) * b)]);
};

const RULES = [["shipped  b .35 k 1.0", .35, 1.0], ["b .35 k 1.3", .35, 1.3],
  ["b .45 k 1.3", .45, 1.3], ["b .25 k 1.5", .25, 1.5], ["b .30 k 1.4", .30, 1.4],
  ["b .50 k 1.0", .50, 1.0]];

console.log("rule                 worst contrast   Dreadking vs Redhelm   Silverwind vs Elderfrost");
for (const [label, b, k] of RULES) {
  const outs = BASES.map(([, h]) => bright(hexRgb(h), b, k));
  const w = Math.min(...outs.map(worstOf));
  const dk = dE(outs[7], REDHELM), sw = dE(outs[4], ELDERFROST);
  console.log("  " + label.padEnd(21) + w.toFixed(2).padStart(9) + (w >= 4.5 ? "  ok" : "  FAIL") +
    dk.toFixed(1).padStart(19) + (dk < 10 ? " !!" : "   ") +
    sw.toFixed(1).padStart(21) + (sw < 10 ? " !!" : ""));
}

const PICK = [.30, 1.4];
console.log("\nb " + PICK[0] + " k " + PICK[1] + " in full — saturation up, lightness up a little:");
console.log("  monster       base      shipped   brighter   sat        light      contrast");
for (const [name, h] of BASES) {
  const c = hexRgb(h);
  const old = bright(c, .35, 1), nu = bright(c, PICK[0], PICK[1]);
  const [, s0, l0] = rgbToHsl(c), [, s1, l1] = rgbToHsl(nu);
  console.log("  " + name.padEnd(13) + h + "  " + hex(old) + "  " + hex(nu) + "  " +
    (Math.round(s0 * 100) + "% -> " + Math.round(s1 * 100) + "%").padEnd(11) +
    (Math.round(l0 * 100) + "% -> " + Math.round(l1 * 100) + "%").padEnd(11) +
    worstOf(nu).toFixed(2));
}
