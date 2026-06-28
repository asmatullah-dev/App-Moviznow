const axios = require('axios');
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const target = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=irrpsfrrf0sfsar&token=YmtPVTgrZkdNUDNiUTlIRjgxdWpsc1BWSTgyZmJpQ2JzdFVyQkZ3S01iOD0=";
axios.get(target, { headers }).then(res => {
   const text = res.data;
   const links = [...text.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
   console.log("links:", links);
}).catch(e => console.error(e.response ? e.response.data : e.message));
