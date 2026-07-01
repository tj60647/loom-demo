import { db } from "./src/db";
import { bytes } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const allBytes = await db.select().from(bytes);
  for (const b of allBytes) {
    if (b.source?.includes("Bucciarelli")) {
      console.log(`\n=== Byte ${b.id} ===`);
      console.log(b.content);
    }
  }
}

run().catch(console.error);
