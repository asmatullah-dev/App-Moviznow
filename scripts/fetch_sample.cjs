const fs = require("fs");
async function run() {
  const res = await fetch("https://play4u.org/watch/tt22084616", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
  });
  const html = await res.text();
  fs.writeFileSync("./play4u_sample.html", html);
  console.log("SUCCESS, html length:", html.length);
  const idx = html.indexOf("bigPlay");
  if (idx !== -1) console.log("Found bigPlay:", html.slice(Math.max(0, idx - 100), idx + 300));
  const idx2 = html.indexOf("big-play");
  if (idx2 !== -1) console.log("Found big-play:", html.slice(Math.max(0, idx2 - 100), idx2 + 300));
  const allSvgs = html.match(/<svg[\s\S]*?<\/svg>/gi);
  console.log("Total SVGs:", allSvgs ? allSvgs.length : 0);
  if (allSvgs) {
    allSvgs.forEach((s, i) => console.log("SVG " + i + ":", s.replace(/\s+/g, " ").slice(0, 150)));
  }
  const assets = html.match(/(?:href|src)=["']/g);
  // find script or style tags
  const styles = html.match(/<style[\s\S]*?<\/style>/gi);
  console.log("Styles count:", styles ? styles.length : 0);
  if (styles) {
    fs.writeFileSync("./play4u_styles.css", styles.join("\n\n"));
  }
}
run().catch(console.error);
