const axios = require('axios');
const target = "https://telegram.me/Paneer_Momos_rbot?start=PVFUTTJZRE4ySURPM0V6WHlNRE8xWVRNZkpqTjJJRE0zTXpNM01ETXdFVEw=";
axios.get(target, { validateStatus: () => true }).then(res => {
   console.log("Status:", res.status);
   console.log("Location:", res.headers.location);
   console.log("Data:", res.data.substring(0, 500));
}).catch(e => console.error(e.message));
