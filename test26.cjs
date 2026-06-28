const axios = require('axios');
axios.get("https://api.microlink.io?url=https://hubcloud.foo/drive/irrpsfrrf0sfsar&meta=false&data.html.selector=body").then(res => {
   const text = res.data.data.html;
   const links = [...text.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
   console.log("links:", links);
}).catch(e => console.error(e.response ? e.response.data : e.message));
