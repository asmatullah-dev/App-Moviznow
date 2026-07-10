import translate from 'google-translate-api-x';
translate('A deaf and mute serial killer in Mumbai can only hear his beautiful sister\'s voice as he commits murders for mysterious reasons.', {to: 'ur'}).then(res => {
  console.log("Urdu:", res.text);
  console.log("Roman:", res.pronunciation);
}).catch(console.error);
