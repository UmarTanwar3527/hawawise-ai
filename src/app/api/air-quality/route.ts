import { connection } from "next/server";

import { notImplemented } from "@/lib/http/api-response";

// Reserved endpoint. Implemented in a later milestone; see docs/architecture.md.

export async function GET() {
  await connection();
  return notImplemented("Air-quality data");
}
