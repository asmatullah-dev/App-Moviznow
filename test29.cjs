const axios = require('axios');
const target = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=irrpsfrrf0sfsar&token=YmtPVTgrZkdNUDNiUTlIRjgxdWpsc1BWSTgyZmJpQ2JzdFVyQkZ3S01iOD0=";
axios.get("https://api.microlink.io?url=" + encodeURIComponent(target) + "&meta=false&data.html.selector=body").then(res => {
   const text = res.data.data.html;
   const links = [...text.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
   console.log("links:", links);
}).catch(e => console.error(e.response ? e.response.data : e.message));
