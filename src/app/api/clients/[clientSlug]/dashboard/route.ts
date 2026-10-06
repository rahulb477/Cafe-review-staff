import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const client = await FirebaseService.getClientConfig(clientSlug);

    // Default response structure
    const stats = {
      todayStamps: 0,
      todayCustomers: 0,
      todayReviews: 0,
      rewardsRedeemed: 0,
    };

    return NextResponse.json({ success: true, client, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
