import { db } from "./src/db";
import { passages } from "./src/db/schema";

async function run() {
  const allPassages = await db.select().from(passages);
  for (const b of allPassages) {
    if (b.source?.includes("Bucciarelli")) {
      console.log(`\n=== Passage ${b.id} ===`);
      console.log(b.content);
    }
  }
}

run().catch(console.error);
