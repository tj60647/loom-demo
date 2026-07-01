import { db } from "./src/db";
import { bytes } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function audit() {
  const allBytes = await db.select().from(bytes);
  console.log(`Found ${allBytes.length} bytes in the database.`);
  
  const malformed = allBytes.filter(b => b.startOffset === null || b.endOffset === null);
  console.log(`Found ${malformed.length} bytes with NULL offsets (fallback to fuzzy mode).`);
  
  const valid = allBytes.filter(b => b.startOffset !== null && b.endOffset !== null);
  console.log(`Found ${valid.length} bytes with VALID offsets.`);
  
  console.log("\nDetails of bytes:");
  for (const b of allBytes) {
    console.log(`- Byte ID: ${b.id}`);
    console.log(`  Source: ${b.source}, Page: ${b.pageNumber}`);
    console.log(`  Content length: ${b.content.length}`);
    console.log(`  startOffset: ${b.startOffset}, endOffset: ${b.endOffset}`);
  }
}

audit().catch(console.error);
