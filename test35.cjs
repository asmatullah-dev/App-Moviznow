const axios = require('axios');
const target = "https://hubcloud.cx/tg/go?id=3Ofp3dyuoqThzuDY3N/K4aHZ3NCju+rPzODi6tHh2NXk4ajn59bf3bHDy7O+yMe/x7u5p+7AvsbDwp2/qsq92bfGuK3lwMrFw8fU5OTJ17O+xbqd48jL5bu2pKS6wcHYucuy4LE=";
axios.get(target, { maxRedirects: 0, validateStatus: () => true }).then(res => {
   console.log("Status:", res.status);
   console.log("Location:", res.headers.location);
   console.log("Data length:", res.data?.length);
}).catch(e => console.error(e.message));
