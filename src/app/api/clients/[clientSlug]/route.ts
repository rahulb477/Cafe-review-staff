import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const client = await FirebaseService.getClientConfig(clientSlug);
    return NextResponse.json({ success: true, client });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
