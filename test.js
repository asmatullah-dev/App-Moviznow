async function test() {
  try {
    const res = await fetch('https://new1.filesdl.in/cloudcab/Qyb9n1HmKM', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(res.status, res.url);
    const text = await res.text();
    console.log("hubcloud match:", text.match(/https?:\/\/[^"'\s]*(?:hubcloud|hubcould|vcloud\.live|hubdrive)\.[^"'\s]*/i));
  } catch (e) {
    console.error(e);
  }
}
test();
