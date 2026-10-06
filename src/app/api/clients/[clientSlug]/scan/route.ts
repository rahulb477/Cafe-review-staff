import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const body = await req.json();
    const { qrData } = body;

    if (!qrData) {
      return NextResponse.json({ error: "No QR code payload provided." }, { status: 400 });
    }

    const customer = await FirebaseService.scanAndResolveCustomer(qrData, clientSlug);

    return NextResponse.json({
      success: true,
      customer,
      message: `Customer identified: ${customer.name}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
