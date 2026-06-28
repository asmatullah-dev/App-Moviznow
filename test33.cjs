const http = require('http');
const axios = require('axios');
const server = http.createServer((req, res) => {
   res.writeHead(302, { Location: "tg://resolve?domain=test" });
   res.end();
});
server.listen(3001, () => {
   axios.get("http://127.0.0.1:3001/").catch(e => {
      console.log("Error message:", e.message);
      console.log("Error config url:", e.config?.url);
      server.close();
   });
});
