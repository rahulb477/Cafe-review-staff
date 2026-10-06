import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const body = await req.json();
    const { customerId, staffUser, staffId, transactionId } = body;

    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const effectiveStaff = staffUser || {
      uid: staffId || "staff",
      clientId: clientSlug,
      name: "Staff",
      email: "staff@store.com",
    };

    const result = await FirebaseService.redeemReward(
      clientSlug,
      String(customerId),
      effectiveStaff,
      transactionId
    );

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to redeem reward" }, { status: 400 });
  }
}
