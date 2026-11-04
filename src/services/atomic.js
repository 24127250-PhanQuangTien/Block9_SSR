const { Prisma } = require("@prisma/client");
// No database-specific SQL. Serializable retries also handle concurrent create/upsert.
async function atomic(db, work) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 }); }
    catch (error) { if (attempt >= 4 || !["P2034", "P2002"].includes(error.code)) throw error; }
  }
}
module.exports = { atomic };
