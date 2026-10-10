async function test() {
  const ids = ["tt15398776", "tt15239678", "tt0499549", "tt1375666", "tt0848228", "tt4154796", "tt1877830", "tt10872600", "tt6263850", "tt27357406"];
  for (const id of ids) {
    try {
      const res = await fetch("https://play4u.org/" + id, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      });
      console.log(id, "status:", res.status);
      if (res.ok) {
        const text = await res.text();
        console.log("Found working movie!", id, "length:", text.length);
        const m = text.match(/assets\/[^"'\s]+/g);
        console.log("Assets:", m);
        const bp = text.match(/bigPlay|big-play/g);
        console.log("bp matches:", bp);
        require("fs").writeFileSync("./play4u_sample.html", text);
        break;
      }
    } catch(e) {
      console.log(id, "error:", e.message);
    }
  }
}
test();
