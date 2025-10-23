// app/api/debate/[expId]/human-response/route.ts
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: { expId: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { expId } = await params;
    const { response_text, extracted_answer } = await req.json();

    if (!response_text) {
      return NextResponse.json(
        { success: false, message: "response_text is required" },
        { status: 400 }
      );
    }

    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    const backendUrl = `${process.env.BACKEND_URL}/api/v1/debate/${expId}/human-response`;

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_text, extracted_answer }),
    });

    if (!backendResponse.ok) {
      let errorMessage = `Backend error: ${backendResponse.status}`;
      try {
        const contentType = backendResponse.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const errorJson = await backendResponse.json();
          errorMessage = errorJson.detail || errorJson.message || errorMessage;
        } else {
          const text = await backendResponse.text();
          errorMessage = text || errorMessage;
        }
      } catch (e) {
        console.error("Error parsing backend error:", e);
      }

      console.error("Backend error:", errorMessage);
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
