import { connection } from "next/server";

/**
 * Liveness check for deployment monitoring. Deliberately reports nothing
 * about configuration or secrets.
 */
export async function GET() {
  // Evaluate per request so the timestamp is never served from a prerender.
  await connection();

  return Response.json(
    {
      status: "ok",
      service: "hawawise-ai",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
