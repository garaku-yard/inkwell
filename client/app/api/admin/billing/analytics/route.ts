import { NextRequest, NextResponse } from "next/server";

// Mock analytics data
const analytics = {
  mrr: 2850,
  arr: 34200,
  activeSubscribers: 195,
  churnRate: 3.2,
  revenueByTier: {
    Free: 0,
    Pro: 2850,
    Enterprise: 0,
  },
  growth: {
    mrrGrowth: 12.5,
    subscriberGrowth: 8.3,
  },
};

export async function GET(request: NextRequest) {
  try {
    // TODO: Verify admin role from session/JWT
    
    return NextResponse.json(analytics);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
