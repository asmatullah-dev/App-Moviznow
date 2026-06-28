const axios = require('axios');
const targetUrl = "https://gamerxyt.com/tg/go?id=some_id"; 
const mlUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}`;
axios.get(mlUrl).then(res => {
   console.log(res.data);
}).catch(e => console.error(e.message));
