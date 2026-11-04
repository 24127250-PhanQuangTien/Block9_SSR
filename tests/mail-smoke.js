// Opt-in SMTP connection check only. Does not send an email or print credentials.
require("dotenv").config();
const { transport } = require("../src/services/mail");
let timer;
Promise.race([
  transport().then(client => client.verify()),
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), 25000); }),
]).then(() => console.log(JSON.stringify({ smtp: "PASS", mode: process.env.SMTP_HOST ? "configured SMTP" : "Ethereal fallback", emailSent: false })))
  .catch(() => { console.log(JSON.stringify({ smtp: "UNVERIFIED", mode: process.env.SMTP_HOST ? "configured SMTP" : "Ethereal fallback", details: "Network/SMTP connection could not be verified; sensitive details withheld.", emailSent: false })); process.exitCode = 1; })
  .finally(() => { clearTimeout(timer); });
