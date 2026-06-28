const axios = require('axios');
axios.get("https://api.microlink.io?url=https://gamerxyt.com/link-generated/?link=dGVyaW1laHJiYW5p&meta=false&data.html.selector=html").then(res => {
   console.log(res.data.data.html.substring(0, 500));
}).catch(e => console.error(e.response ? e.response.data : e.message));
