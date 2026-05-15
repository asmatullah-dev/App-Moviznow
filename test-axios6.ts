import axios from 'axios';
(async () => {
  try {
      const res = await axios.get('https://pixel.hubcloud.cx/?id=31e05ce89be413d09ef2c007e5962ce32ed93f2f532cf231a3d96abbaaec76f4d4afc20cd2ead39e9e4cda567b601f0c1744a19df0149fbd5a9c783cf6a952e32bc708bd544b2dd924092547353cf8b17cf694b1dd0414c03f5ea8b31b1b6f5c::e4ae6cd0b80cc9aa1117a514f715d144', { headers: { Range: 'bytes=0-0' } });
      console.log('Success', res.status, res.request?.res?.responseUrl);
  } catch(e) {
      console.log('Error', e.message, e.response?.status);
  }
})();
