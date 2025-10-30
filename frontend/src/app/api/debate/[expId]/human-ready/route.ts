import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, context: { params: { expId: string } }) {
  const params = await context.params;
  const { expId } = params;
  console.log("POST /human-ready called with expId:", expId);

  if (!process.env.BACKEND_URL) {
    return NextResponse.json({ success: false, message: "Backend URL not configured" }, { status: 500 });
  }

  const backendUrl = `${process.env.BACKEND_URL}/api/v1/debate/${expId}/human-ready`;

  try {
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debateId: expId }),
    });

    const text = await backendResponse.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    if (!backendResponse.ok) {
      return NextResponse.json({ success: false, message: data.message || "Backend error" }, { status: backendResponse.status });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal server error" }, { status: 500 });
  }
}
