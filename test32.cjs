const axios = require('axios');
axios.get("http://httpbin.org/redirect-to?url=tg://resolve%3Fdomain=test").then(res => {
   console.log("Success");
}).catch(e => {
   console.log("Error:", e.message);
   console.log("Error code:", e.code);
   console.log("Request path:", e.request?.path);
   console.log("Config URL:", e.config?.url);
});
