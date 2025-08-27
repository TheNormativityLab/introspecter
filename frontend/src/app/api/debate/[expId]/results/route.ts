import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ expId: string }> }
) {
  const { expId } = await context.params;

  try {
    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    const backendResponse = await fetch(
      `${process.env.BACKEND_URL}/api/v1/debate/${expId}/results`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
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
      } catch {}

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
