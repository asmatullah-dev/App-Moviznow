const axios = require('axios');
const https = require('https');
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const targetUrl = "https://gamerxyt.com/";
const mlUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=false&prerender=true&data.html.selector=html`;

axios.get(mlUrl, { headers, httpsAgent }).then(res => {
   console.log(Object.keys(res.data.data));
   if (res.data.data.html) {
       console.log("HTML length:", res.data.data.html.length);
       console.log("Snippet:", res.data.data.html.substring(0, 150));
   }
}).catch(e => console.error(e.message));
