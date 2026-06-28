const axios = require('axios');
axios.get("https://api.microlink.io?url=http://httpbin.org/status/302").then(res => {
   console.log(res.data.statusCode, res.data.headers);
}).catch(e => console.error(e.response ? e.response.data : e.message));
