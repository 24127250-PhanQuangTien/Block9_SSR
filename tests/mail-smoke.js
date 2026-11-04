// Opt-in SMTP connection check only. Does not send an email or print credentials.
require("dotenv").config();
const { transport } = require("../src/services/mail");
const { mailDiagnostic } = require("../src/services/mailDiagnostics");
let timer;
let client;
Promise.race([
  transport().then(value =>
  {
    client = value;
    return client.verify();
  }),
  new Promise((_, reject) =>
  {
    timer = setTimeout(() => reject(Object.assign(new Error("TIMEOUT"), { code: "ETIMEDOUT" })), 25000);
  }),
]).then(() => console.log(JSON.stringify({ smtp: "PASS", mode: process.env.SMTP_HOST ? "configured SMTP" : "Ethereal fallback", emailSent: false })))
  .catch(error =>
  {
    console.log(JSON.stringify({ smtp: "UNVERIFIED", mode: process.env.SMTP_HOST ? "configured SMTP" : "Ethereal fallback", ...mailDiagnostic(error), emailSent: false }));
    process.exitCode = 1;
  })
  .finally(() =>
  {
    clearTimeout(timer);
    if (client) client.close();
  });
