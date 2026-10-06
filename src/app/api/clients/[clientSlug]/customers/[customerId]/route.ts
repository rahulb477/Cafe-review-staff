import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string; customerId: string }> }
) {
  try {
    const { clientSlug, customerId } = await params;
    const customer = await FirebaseService.getCustomerById(customerId, clientSlug);
    return NextResponse.json({ success: true, customer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}
