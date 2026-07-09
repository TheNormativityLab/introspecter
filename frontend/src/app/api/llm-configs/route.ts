import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  console.log("[llm-configs] GET request received");
  
  const backendUrl = process.env.BACKEND_URL || "http://introspecter-backend:8000";
  
  const fullUrl = `${backendUrl}/api/v1/debate/llm-configs`;
  console.log("[llm-configs] Fetching from:", fullUrl);

  try {
    const backendResponse = await fetch(fullUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    console.log("[llm-configs] Backend response status:", backendResponse.status);

    const text = await backendResponse.text();
    console.log("[llm-configs] Backend response text:", text.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    if (!backendResponse.ok) {
      return NextResponse.json(
        { success: false, message: data.message || "Backend error" },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[llm-configs] Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}