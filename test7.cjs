const axios = require('axios');
const https = require('https');
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const fetchWithMicrolink = async (targetUrl) => {
   try {
      const mlUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=false&data.html.selector=html&prerender=true`;
      console.log(mlUrl);
      const mlRes = await axios.get(mlUrl, { headers, httpsAgent });
      if (mlRes.data && mlRes.data.data && mlRes.data.data.html) {
         return mlRes.data.data.html;
      }
   } catch (e) {
      console.error("Microlink failed for", targetUrl, e.message);
   }
   const res = await axios.get(targetUrl, { headers, httpsAgent });
   return res.data;
};

fetchWithMicrolink('https://gamerxyt.com/link-generated/?link=dGVyaW1laHJiYW5p').then(text => console.log(typeof text, text.substring(0, 500))).catch(e => console.error(e));
