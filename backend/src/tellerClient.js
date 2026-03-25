// ── UseOrigin — Teller.io API Client ────────────────────────
// Teller requires mTLS authentication in development mode.
// Cert and key are passed directly into https.request options
// (not via https.Agent) — this is the only pattern that works
// reliably in Node 20 with Teller's strict certificate check.
const https = require("https");
const fs = require("fs");

const TELLER_API_BASE = "https://api.teller.io";

/**
 * Read the mTLS cert/key from the paths in env, or return nulls.
 */
function readCerts() {
    const certPath = process.env.TELLER_CERT_PATH || "/app/certs/certificate.pem";
    const keyPath = process.env.TELLER_KEY_PATH || "/app/certs/private_key.pem";
    try {
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            return {
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath),
            };
        }
    } catch (e) {
        console.warn("[Teller] Could not read certs:", e.message);
    }
    return {};
}

/**
 * Make an authenticated request to the Teller API.
 * Uses HTTP Basic Auth: username = accessToken, password = empty.
 */
function tellerRequest(accessToken, endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        const { cert, key } = readCerts();

        const requestOptions = {
            hostname: "api.teller.io",
            port: 443,
            path: endpoint,
            method: options.method || "GET",
            headers: {
                Authorization: "Basic " + Buffer.from(`${accessToken}:`).toString("base64"),
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            // Pass cert + key directly in the request options — NOT via Agent.
            // This is confirmed working with Teller's mTLS requirement.
            ...(cert && key ? { cert, key } : {}),
        };

        const req = https.request(requestOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { resolve(data); }
                } else {
                    const error = new Error(`Teller API ${res.statusCode}: ${data}`);
                    error.status = res.statusCode;
                    error.body = data;
                    reject(error);
                }
            });
        });

        req.on("error", (e) => reject(e));

        if (options.body) {
            req.write(typeof options.body === "string"
                ? options.body
                : JSON.stringify(options.body));
        }

        req.end();
    });
}

module.exports = { tellerRequest, TELLER_API_BASE };
