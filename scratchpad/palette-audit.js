// Both checks CLAUDE.md now demands, over every colour the app can paint:
// white contrast on --bg/--bg2/--hover, and CIE Lab distinctness between plates.
const fs = require("fs");
const src = fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/app.js", "utf8");
const g = (re) => src.match(re)[0];
const pre = [g(/const clamp = [^\n]+/), g(/const clamp01 = [^\n]+/), g(/const hexRgb = [^\n]+/),
  g(/function rgbToHsl[\s\S]*?\n  \}/), g(/function hslToRgb[\s\S]*?\n  \}/),
  g(/const shade = \(rgb, lo, hi\) => \{[\s\S]*?\n  \};/),
  g(/const lighten = \(rgb, b, minL\) => \{[\s\S]*?\n  \};/)].join("\n");
const { shade, hexRgb } = new Function(pre + "; return {shade, hexRgb};")();
const COLORS = new Function("return " + g(/\[\s*\n\s*\["Redhelm"[\s\S]*?\n  \];/).replace(/;$/, ""))();
const VARIANTS = new Function(g(/const VARIANTS = \{[\s\S]*?\n  \};/) + "; return VARIANTS;")();
const NAME = Object.fromEntries(COLORS.map(([n, h]) => [h.toUpperCase(), n]));

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

// One row per paintable colour. A variant that equals its tile hex is the same
// plate as the palette entry, so it is not counted twice.
const seen = new Set(), rows = [];
for (const [name, h] of COLORS) { seen.add(h.toUpperCase()); rows.push([name, h]); }
for (const k of Object.keys(VARIANTS))
  for (const [, h, label] of VARIANTS[k])
    if (!seen.has(h.toUpperCase())) { seen.add(h.toUpperCase()); rows.push([(NAME[k] || k) + " " + label.toLowerCase(), h]); }

console.log("paintable colours: " + rows.length +
  "  (" + COLORS.length + " palette + " + (rows.length - COLORS.length) + " distinct variant)\n");

const fails = rows.filter(([, h]) => worstOf(hexRgb(h)) < 4.5);
console.log("CONTRAST — white on --bg / --bg2 / --hover, floor 4.5:1");
console.log("  below floor: " + (fails.length ? fails.map(f => f[0] + " " + f[1]).join(", ") : "none"));
const byC = rows.map(([n, h]) => [n, h, worstOf(hexRgb(h))]).sort((a, b) => a[2] - b[2]);
console.log("  tightest five:");
byC.slice(0, 5).forEach(([n, h, w]) => console.log("    " + n.padEnd(26) + h + "   " + w.toFixed(2) + ":1"));

console.log("\nDISTINCTNESS — CIE Lab dE between every pair");
const pairs = [];
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
  pairs.push([rows[i][0] + " " + rows[i][1], rows[j][0] + " " + rows[j][1],
              dE(hexRgb(rows[i][1]), hexRgb(rows[j][1]))]);
pairs.sort((a, b) => a[2] - b[2]);
const tooClose = pairs.filter(p => p[2] < 10);
console.log("  pairs under dE 10 (indistinguishable at swatch size): " + tooClose.length);
tooClose.forEach(p => console.log("    !! " + p[0].padEnd(30) + " vs " + p[1].padEnd(30) + " dE " + p[2].toFixed(1)));
console.log("  next closest:");
pairs.filter(p => p[2] >= 10).slice(0, 6)
  .forEach(p => console.log("     " + p[0].padEnd(30) + " vs " + p[1].padEnd(30) + " dE " + p[2].toFixed(1)));
