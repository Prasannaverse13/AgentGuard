// Removed. Owner actions now go to /api/owner with a MetaMask signature. Safe to delete this folder.
export const dynamic = "force-dynamic";
export async function POST() {
  return Response.json({ error: "Owner actions need a MetaMask signature" }, { status: 410 });
}
