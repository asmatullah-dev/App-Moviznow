const axios = require('axios');
axios.get("https://api.microlink.io?url=http://httpbin.org/status/302&meta=false").then(res => {
   console.log(res.data);
}).catch(e => console.error(e.message));
