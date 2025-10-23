// app/api/debate/run/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const debateId = searchParams.get("debateId");

    if (!debateId) {
      return NextResponse.json(
        { success: false, message: "Debate ID is required" },
        { status: 400 }
      );
    }

    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    try {
      const backendResponse = await fetch(
        `${process.env.BACKEND_URL}/api/v1/debate/run?debateId=${debateId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!backendResponse.ok) {
        const contentType = backendResponse.headers.get("content-type");
        const errorText = await backendResponse.text();
        console.error(`Backend error ${backendResponse.status}:`, errorText);

        if (contentType?.includes("application/json")) {
          return NextResponse.json(
            {
              success: false,
              message: errorText || "Failed to fetch debate run details",
            },
            { status: backendResponse.status }
          );
        } else {
          return NextResponse.json(
            {
              success: false,
              message: `Backend error: ${backendResponse.status} ${backendResponse.statusText}`,
            },
            { status: backendResponse.status }
          );
        }
      }

      const data = await backendResponse.json();
      return NextResponse.json(data);
    } catch (fetchError) {
      console.error("Backend fetch error:", fetchError);
      return NextResponse.json(
        { success: false, message: "Failed to connect to backend service" },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
