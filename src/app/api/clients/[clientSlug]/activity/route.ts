import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  try {
    const { clientSlug } = await params;
    const q = query(
      collection(db, "clients", clientSlug, "stampTransactions"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const snap = await getDocs(q);
    const activities = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      const isReward = d.type === "REWARD_REDEEMED";
      return {
        id: docSnap.id,
        clientId: clientSlug,
        staffId: d.staffId,
        staffName: d.staffName,
        customerId: d.customerId,
        customerName: d.customerName,
        customerCode: d.customerCode,
        activityType: isReward ? "REWARD_REDEEMED" : "STAMP_ADDED",
        title: d.title || (isReward ? "Reward Redeemed" : "Stamp Added"),
        description: d.description || `Customer #${d.customerId?.substring(0, 6) || ""}`,
        badgeText: isReward ? "Gift" : "+1",
        badgeType: isReward ? "reward" : "stamp",
        timeFormatted: d.createdAt?.toDate ? d.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
        timestamp: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
        transactionId: docSnap.id,
      };
    });

    return NextResponse.json({ success: true, activities });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
