const axios = require('axios');
const target = "https://hubcloud.cx/tg/bot/?start=PVFUTTJZRE4ySURPM0V6WHlNRE8xWVRNZkpqTjJJRE0zTXpNM01ETXdFVEw=";
axios.get(target, { maxRedirects: 0, validateStatus: () => true }).then(res => {
   console.log("Status:", res.status);
   console.log("Location:", res.headers.location);
   console.log("Data length:", res.data?.length);
}).catch(e => console.error(e.message));
