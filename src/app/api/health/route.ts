export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "cafe-review-staff",
    backend: "firebase",
  });
}
