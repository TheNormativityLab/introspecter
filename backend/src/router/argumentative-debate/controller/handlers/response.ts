import { Request, Response } from "express";
import axios from "axios";
import { logger } from "../../../../services/logger";

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || "http://introspecter-api:3001";

export const postResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const responseData = req.body;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const response = await axios.post(
      `${FASTAPI_BASE_URL}/debates/argumentative-debate`,
      responseData,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        timeout: 60000,
        responseType: "stream",
        validateStatus: (status) => status < 600,
      }
    );

    if (response.status >= 400) {
      logger.error("FastAPI error:", {
        status: response.status,
        data: response.data,
      });
      
      res.write(`data: ${JSON.stringify({
        type: "error",
        message: "Failed to generate argument",
        status: response.status
      })}\n\n`);
      res.end();
      return;
    }

    response.data.pipe(res);

    response.data.on("error", (error: Error) => {
      logger.error("Stream error:", error);
      if (!res.headersSent) {
        res.write(`data: ${JSON.stringify({
          type: "error",
          message: error.message
        })}\n\n`);
      }
      res.end();
    });

  } catch (error) {
    logger.error("Error in postResponse:", error);
    
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
    
    res.write(`data: ${JSON.stringify({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error"
    })}\n\n`);
    res.end();
  }
};