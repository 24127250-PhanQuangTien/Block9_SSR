require("dotenv").config();
const db = require("../src/prisma");

const knownChefMappings = new Map([
  [1, 1], // Phở Bò Tái Nạm -> Nguyễn Hải Đăng
  [2, 1], // Bún Chả Hà Nội -> Nguyễn Hải Đăng
  [3, 3], // Cơm Tấm Sườn Bì Chả -> Lê Hoàng Phúc
  [4, 3], // Gỏi Cuốn Tôm Thịt -> Lê Hoàng Phúc
  [5, 2], // Chè Hạt Sen Long Nhãn -> Trần Thị Mai Lan
  [6, 3], // Lẩu Cua Đồng Hải Sản -> Lê Hoàng Phúc
  [7, 1], // Mì Quảng Tôm Thịt -> Nguyễn Hải Đăng
]);

const sampleIds = [9083, 9084, 9085, 9086];
const sampleNames = new Set([
  "Món mẫu Bếp A - draft",
  "Món mẫu Bếp A - published",
  "Món mẫu Bếp B - draft",
  "Món mẫu Bếp B - published",
]);

async function inspect() {
  const known = await db.dish.findMany({ where: { id: { in: [...knownChefMappings.keys()] } }, select: { id: true, name: true, chefId: true }, orderBy: { id: "asc" } });
  const samples = await db.dish.findMany({ where: { id: { in: sampleIds } }, select: { id: true, name: true, status: true, chefId: true }, orderBy: { id: "asc" } });
  return { known, samples };
}

async function main() {
  const before = await inspect();
  const validSamples = before.samples.length === sampleIds.length && before.samples.every(row => sampleNames.has(row.name));
  const summary = { knownMappings: before.known.length, identifiedSamples: before.samples.map(({ id, name, status, chefId }) => ({ id, name, status, chefId })) };
  if (process.argv[2] === "--verify") {
    const remainingAB = await db.dish.count({ where: { chefId: { in: [12, 13] } } });
    const [published, draft] = await Promise.all([db.dish.count({ where: { status: "published" } }), db.dish.count({ where: { status: "draft" } })]);
    console.log(JSON.stringify({ mode: "verify", totalDishCount: await db.dish.count(), published, draft, remainingBepAOrBepB: remainingAB, known: before.known, remainingSamples: before.samples }));
    return;
  }
  if (process.argv[2] !== "--confirm") {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }));
    return;
  }
  if (before.known.length !== knownChefMappings.size || !validSamples) throw new Error("restore precondition failed; database unchanged");
  const result = await db.$transaction(async tx => {
    let updated = 0;
    for (const [dishId, chefId] of knownChefMappings) {
      const change = await tx.dish.updateMany({ where: { id: dishId }, data: { chefId } });
      updated += change.count;
    }
    const deleted = await tx.dish.deleteMany({ where: { id: { in: sampleIds } } });
    if (updated !== knownChefMappings.size || deleted.count !== sampleIds.length) throw new Error("restore row-count check failed; transaction rolled back");
    return { updatedKnownDishChefIds: updated, deletedConfirmedSeedSamples: deleted.count };
  });
  console.log(JSON.stringify({ mode: "confirmed", ...result, unresolvedDishCount: 1012 }));
}

main().catch(() => { console.error("restore failed; transaction rolled back or was not started."); process.exitCode = 1; }).finally(() => db.$disconnect());
