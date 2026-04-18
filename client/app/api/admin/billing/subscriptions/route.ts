import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

// Mock data for subscriptions
const subscriptions = [
  {
    id: "1",
    userId: "user-1",
    userName: "John Doe",
    userEmail: "john@example.com",
    tierId: "2",
    tierName: "Pro",
    gatewayId: "1",
    status: "active",
    billingCycle: "monthly",
    currentPeriodStart: new Date("2024-01-01"),
    currentPeriodEnd: new Date("2024-02-01"),
    cancelAtPeriodEnd: false,
    usage: {
      aiTokensUsed: 15000,
      aiTokensLimit: 100000,
      projectsCreated: 8,
      maxProjects: 25,
      collaboratorsAdded: 2,
      maxCollaborators: 5,
      storageUsedGB: 12.5,
      storageGB: 50,
    },
  },
  {
    id: "2",
    userId: "user-2",
    userName: "Jane Smith",
    userEmail: "jane@example.com",
    tierId: "1",
    tierName: "Free",
    gatewayId: "1",
    status: "active",
    billingCycle: "monthly",
    currentPeriodStart: new Date("2024-01-15"),
    currentPeriodEnd: new Date("2024-02-15"),
    cancelAtPeriodEnd: false,
    usage: {
      aiTokensUsed: 8500,
      aiTokensLimit: 10000,
      projectsCreated: 2,
      maxProjects: 3,
      collaboratorsAdded: 0,
      maxCollaborators: 1,
      storageUsedGB: 3.2,
      storageGB: 5,
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const tierFilter = searchParams.get("tier");
    const statusFilter = searchParams.get("status");
    
    let filtered = subscriptions;
    
    if (tierFilter) {
      filtered = filtered.filter((s) => s.tierId === tierFilter);
    }
    
    if (statusFilter) {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }
    
    return NextResponse.json(filtered);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    const body = await request.json();
    const { id, action } = body;
    
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }
    
    if (action === "sync") {
      // TODO: Sync with payment gateway
      return NextResponse.json({ success: true, message: "Synced with gateway" });
    }
    
    return NextResponse.json(sub);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
