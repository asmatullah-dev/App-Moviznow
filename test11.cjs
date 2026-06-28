const axios = require('axios');
const targetUrl = "https://gamerxyt.com/tg/go?id=some_id"; // or similar redirect
const mlUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&meta=false`;
axios.get(mlUrl).then(res => {
   console.log(res.data.data.url);
}).catch(e => console.error(e.message));
