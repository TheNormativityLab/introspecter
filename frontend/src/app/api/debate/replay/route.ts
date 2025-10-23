// app/api/debates/replay/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const replayData = await req.json();

    const requiredFields = [
      "question_index",
      "start_from_round",
      "replace_agent_index",
      "question_data",
      "previous_rounds",
      "original_config",
    ];

    for (const field of requiredFields) {
      if (!(field in replayData)) {
        return NextResponse.json(
          {
            success: false,
            message: `Missing required field: ${field}`,
          },
          { status: 400 }
        );
      }
    }

    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    try {
      const backendResponse = await fetch(
        `${process.env.BACKEND_URL}/api/v1/debate/replay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(replayData),
        }
      );

      if (!backendResponse.ok) {
        const contentType = backendResponse.headers.get("content-type");
        let errorMessage = `Backend error: ${backendResponse.status} ${backendResponse.statusText}`;

        try {
          if (contentType?.includes("application/json")) {
            const errorJson = await backendResponse.json();
            errorMessage = errorJson.message || JSON.stringify(errorJson);
          } else {
            errorMessage = await backendResponse.text();
          }
        } catch {}

        console.error("Backend error:", errorMessage);
        return NextResponse.json(
          { success: false, message: errorMessage },
          { status: backendResponse.status }
        );
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
