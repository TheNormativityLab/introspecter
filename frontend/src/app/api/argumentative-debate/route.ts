import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.BACKEND_URL) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "Backend URL not configured" })}\n\n`,
        {
          status: 500,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        }
      );
    }

    const body = await req.json();
    const { type, story, question, ai_claim, human_claim, history, human_latest_argument } = body;

    if (!story || !question || !ai_claim) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "Missing required fields" })}\n\n`,
        {
          status: 400,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        }
      );
    }

    try {
      const backendResponse = await fetch(
        `${process.env.BACKEND_URL}/api/v1/debate/response`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
          },
          body: JSON.stringify({
            type,
            story,
            question,
            ai_claim,
            human_claim,
            history,
            human_latest_argument,
          }),
        }
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        console.error("Backend error:", backendResponse.status, errorText);
        return new Response(
          `data: ${JSON.stringify({ type: "error", message: errorText || "Model generation failed" })}\n\n`,
          {
            status: backendResponse.status,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          }
        );
      }

      return new Response(backendResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });

    } catch (fetchError) {
      console.error("Backend connection error:", fetchError);
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "Failed to connect to AI model service" })}\n\n`,
        {
          status: 503,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        }
      );
    }
  } catch (error) {
    console.error("API Route Error:", error);
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Internal server error" })}\n\n`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      }
    );
  }
}