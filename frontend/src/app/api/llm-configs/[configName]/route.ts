// src/app/api/llm-configs/[configName]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: { configName: string } }
) {
  const params = await context.params;
  const { configName } = params;

  if (!process.env.BACKEND_URL) {
    return NextResponse.json(
      { success: false, message: "Backend URL not configured" },
      { status: 500 }
    );
  }

  const backendUrl = `${process.env.BACKEND_URL}/api/v1/debate/llm-configs/${configName}`;

  try {
    const backendResponse = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const text = await backendResponse.text();
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
    console.error("Error fetching LLM config:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}