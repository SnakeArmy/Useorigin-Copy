const https = require("https");
const fs = require("fs");

const cert = fs.readFileSync("/app/certs/certificate.pem");
const key = fs.readFileSync("/app/certs/private_key.pem");

console.log("Cert loaded, length:", cert.length);
console.log("Key loaded, length:", key.length);

const options = {
    hostname: 'api.teller.io',
    port: 443,
    path: '/accounts',
    method: 'GET',
    cert: cert,
    key: key,
    headers: {
        'Authorization': 'Basic ' + Buffer.from('test_token:').toString('base64')
    }
};

const req = https.request(options, (res) => {
    console.log('statusCode:', res.statusCode);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error('Error:', e);
});
req.end();
