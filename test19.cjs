const axios = require('axios');
axios.get("https://api.microlink.io?url=http://httpbin.org/redirect-to?url=https://example.com&meta=false&data.html.selector=html").then(res => {
   console.log(res.data.data.url);
}).catch(e => console.error(e.response ? e.response.data : e.message));
