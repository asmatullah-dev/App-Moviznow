const axios = require('axios');
const target = "https://hubcloud.cx/tg/go?id=3Ofp3dyuoqThzuDY3N/K4aHZ3NCju+rPzODi6tHh2NXk4ajn59bf3bHDy7O+yMe/x7u5p+7AvsbDwp2/qsq92bfGuK3lwMrFw8fU5OTJ17O+xbqd48jL5bu2pKS6wcHYucuy4LE=";
axios.get("https://api.microlink.io?url=" + encodeURIComponent(target) + "&meta=false&data.html.selector=html").then(res => {
   console.log(res.data.data.url);
   console.log(res.data.data.html.substring(0, 500));
}).catch(e => console.error(e.response ? e.response.data : e.message));
