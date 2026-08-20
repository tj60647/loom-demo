import { db } from "./src/db";
import { passages } from "./src/db/schema";

async function audit() {
  const allPassages = await db.select().from(passages);
  console.log(`Found ${allPassages.length} passages in the database.`);
  
  const malformed = allPassages.filter(b => b.startOffset === null || b.endOffset === null);
  console.log(`Found ${malformed.length} passages with NULL offsets (fallback to fuzzy mode).`);
  
  const valid = allPassages.filter(b => b.startOffset !== null && b.endOffset !== null);
  console.log(`Found ${valid.length} passages with VALID offsets.`);
  
  console.log("\nDetails of passages:");
  for (const b of allPassages) {
    console.log(`- Passage ID: ${b.id}`);
    console.log(`  Source: ${b.source}, Page: ${b.pageNumber}`);
    console.log(`  Content length: ${b.content.length}`);
    console.log(`  startOffset: ${b.startOffset}, endOffset: ${b.endOffset}`);
  }
}

audit().catch(console.error);
