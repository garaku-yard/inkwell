import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

// Mock data for tiers (will be replaced with database calls)
let tiers = [
  {
    id: "1",
    name: "Free",
    slug: "free",
    description: "Get started with basic features",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "USD",
    status: "active",
    displayOrder: 0,
    aiTokensLimit: 10000,
    maxProjects: 3,
    maxCollaborators: 1,
    storageGB: 5,
    availableThemes: ["default"],
    aiFeaturesEnabled: false,
    collaborationEnabled: false,
    exportFormats: ["pdf", "fountain"],
    prioritySupport: false,
    customBranding: false,
    limitType: "hard",
    overageHandling: "block",
    trialDays: 0,
    gracePeriodDays: 3,
    gatewayMappings: {},
    subscriberCount: 150,
  },
  {
    id: "2",
    name: "Pro",
    slug: "pro",
    description: "For professional screenwriters",
    monthlyPrice: 19,
    yearlyPrice: 190,
    currency: "USD",
    status: "active",
    displayOrder: 1,
    aiTokensLimit: 100000,
    maxProjects: 25,
    maxCollaborators: 5,
    storageGB: 50,
    availableThemes: ["default", "ocean", "forest", "sunset", "midnight", "rose"],
    aiFeaturesEnabled: true,
    collaborationEnabled: true,
    exportFormats: ["pdf", "fountain", "fdx", "docx"],
    prioritySupport: true,
    customBranding: false,
    limitType: "soft",
    overageHandling: "throttle",
    trialDays: 14,
    gracePeriodDays: 7,
    gatewayMappings: {
      stripe: "price_pro_monthly",
    },
    subscriberCount: 45,
  },
];

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    return NextResponse.json(tiers);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch tiers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    const body = await request.json();
    
    const newTier = {
      id: (tiers.length + 1).toString(),
      ...body,
      subscriberCount: 0,
    };
    
    tiers.push(newTier);
    
    return NextResponse.json(newTier, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create tier" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    const body = await request.json();
    const { id, ...updates } = body;
    
    const index = tiers.findIndex((t) => t.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }
    
    tiers[index] = { ...tiers[index], ...updates };
    
    return NextResponse.json(tiers[index]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update tier" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authError = requireAdmin(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    
    const tier = tiers.find((t) => t.id === id);
    if (!tier) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }
    
    if (tier.subscriberCount && tier.subscriberCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete tier with ${tier.subscriberCount} active subscribers` },
        { status: 400 }
      );
    }
    
    tiers = tiers.filter((t) => t.id !== id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete tier" },
      { status: 500 }
    );
  }
}
