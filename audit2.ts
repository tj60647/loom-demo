import { db } from "./src/db";
import { passages } from "./src/db/schema";

async function run() {
  const allBytes = await db.select().from(passages);
  for (const b of allBytes) {
    if (b.source?.includes("Bucciarelli")) {
      console.log(`\n=== Passage ${b.id} ===`);
      console.log(b.content);
    }
  }
}

run().catch(console.error);
