// Explicit local provisioning only. Never replace existing configuration/values.
require("dotenv").config();
const fs = require("node:fs");
const crypto = require("node:crypto");
const additions = [];
function missing(key, value) { if (!process.env[key]) additions.push(`${key}=${JSON.stringify(value)}`); }
missing("SESSION_SECRET", crypto.randomBytes(48).toString("base64url"));
missing("OTP_PEPPER", crypto.randomBytes(48).toString("base64url"));
missing("MFA_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
missing("NODE_ENV", "development");
missing("APP_BASE_URL", "http://localhost:3000");
missing("APP_ORIGIN", "http://localhost:3000");
missing("TRUST_PROXY", "false");
missing("SEED_USER_EMAIL", "block8-local@example.test");
missing("SEED_USER_PASSWORD", "Local8" + crypto.randomBytes(24).toString("base64url"));
if (additions.length) fs.appendFileSync(".env", "\n# Block8 local configuration (generated only for missing keys)\n" + additions.join("\n") + "\n", { mode: 0o600 });
console.log(JSON.stringify({ configuredMissingKeys: additions.length, existingValuesPreserved: true, secrets: "withheld" }));
