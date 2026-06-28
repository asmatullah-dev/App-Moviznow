const axios = require('axios');
axios.get("http://127.0.0.1:3000/api/resolve-tg?url=https://hubcloud.foo/drive/irrpsfrrf0sfsar").then(res => {
   console.log(res.data);
}).catch(e => console.error(e.response ? e.response.data : e.message));
