const axios = require('axios');
axios.get("https://api.microlink.io?url=http://httpbin.org/redirect-to?url=https://example.com").then(res => {
   console.log(res.data.statusCode, res.data.data.url, res.data.headers);
}).catch(e => console.error(e.response ? e.response.data : e.message));
