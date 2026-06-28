const axios = require('axios');
const cheerio = require('cheerio');
const target = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=irrpsfrrf0sfsar&token=YmtPVTgrZkdNUDNiUTlIRjgxdWpsc1BWSTgyZmJpQ2JzdFVyQkZ3S01iOD0=";
axios.get("https://api.microlink.io?url=" + encodeURIComponent(target) + "&meta=false&data.html.selector=html").then(res => {
   console.log(res.data.data.html.substring(0, 1500));
}).catch(e => console.error(e.response ? e.response.data : e.message));
