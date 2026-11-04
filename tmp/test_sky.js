async function test() {
  const url = "https://new4.skymovieshd.clinic/search.php?search=Hindi&cat=All";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const text = await res.text();
  console.log("Status:", res.status, "Length:", text.length);
  const m = text.match(/\/movie\/[^'"]+/g);
  console.log("Movie links count:", m ? m.length : 0);
  if (m) {
    console.log("First 3:", m.slice(0, 3));
    console.log("Last 3:", m.slice(-3));
  }
}
test().catch(console.error);
