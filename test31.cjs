const axios = require('axios');
axios.get("tg://resolve?domain=test").then(res => {
   console.log("Success");
}).catch(e => console.error(e.message));
