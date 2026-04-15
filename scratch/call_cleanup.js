const https = require('https');

const options = {
  hostname: 'visita-doctores.onrender.com',
  path: '/api/mysql-sync/cleanup-duplicates',
  method: 'POST',
  headers: {
    'Content-Length': 0,
    'x-api-key': 'VD_Secret_Sync_2026_!$#'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
