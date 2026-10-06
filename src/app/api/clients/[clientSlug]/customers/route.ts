import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || undefined;

    const customers = await FirebaseService.getCustomers(clientSlug, search);
    return NextResponse.json({ success: true, customers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
