import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const debate = await req.json();
    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    const backendResponse = await fetch(
      `${process.env.BACKEND_URL}/api/v1/debate/new-debate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debate),
      }
    );

    if (!backendResponse.ok) {
      let errorMessage = `Backend error: ${backendResponse.status} ${backendResponse.statusText}`;
      try {
        const contentType = backendResponse.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const errorJson = await backendResponse.json();
          errorMessage = errorJson.message || JSON.stringify(errorJson);
        } else {
          errorMessage = await backendResponse.text();
        }
      } catch {
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
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
