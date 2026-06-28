const axios = require('axios');
axios.get("https://api.microlink.io?url=http://httpbin.org/redirect-to?url=tg://resolve%3Fdomain=test&meta=false&data.html.selector=html").then(res => {
   console.log(res.data);
}).catch(e => console.error(e.response ? e.response.data : e.message));
