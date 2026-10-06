import { NextRequest, NextResponse } from "next/server";
import { FirebaseService } from "@/services/firebaseService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const result = await FirebaseService.login(email, password);

    if (result.error || !result.staffUser) {
      return NextResponse.json({ error: result.error || "Authentication failed" }, { status: 401 });
    }

    return NextResponse.json({ success: true, staffUser: result.staffUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
