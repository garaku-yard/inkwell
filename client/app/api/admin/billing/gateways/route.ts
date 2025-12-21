import { NextRequest, NextResponse } from "next/server";

// Mock data for gateways
let gateways = [
  {
    id: "1",
    gatewayId: "stripe",
    name: "Stripe",
    provider: "stripe",
    active: true,
    testMode: false,
    publicKey: "pk_test_****1234",
    secretKey: "****5678",
    webhookSecret: "****9012",
    webhooksEnabled: true,
    settings: {},
  },
  {
    id: "2",
    gatewayId: "paddle",
    name: "Paddle",
    provider: "paddle",
    active: false,
    testMode: true,
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
    webhooksEnabled: true,
    settings: {},
  },
  {
    id: "3",
    gatewayId: "lemonsqueezy",
    name: "Lemon Squeezy",
    provider: "lemonsqueezy",
    active: false,
    testMode: true,
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
    webhooksEnabled: true,
    settings: {},
  },
];

export async function GET(request: NextRequest) {
  try {
    // TODO: Verify admin role from session/JWT
    
    return NextResponse.json(gateways);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch gateways" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // TODO: Verify admin role from session/JWT
    
    const body = await request.json();
    const { id, ...updates } = body;
    
    const index = gateways.findIndex((g) => g.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
    }
    
    gateways[index] = { ...gateways[index], ...updates };
    
    return NextResponse.json(gateways[index]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update gateway" },
      { status: 500 }
    );
  }
}
