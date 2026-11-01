import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";

export function validWriteToken(value: unknown): boolean {
  return tokenMatches(value, process.env.GADV_WRITE_TOKEN);
}

function tokenMatches(value: unknown, expected: unknown): boolean {
  if (typeof expected !== "string" || expected.length < 32 || typeof value !== "string") return false;
  const candidate = Buffer.from(value);
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}

export function bearerToken(req: Request): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
}

export function validTelemetryToken(value: unknown, deviceId: unknown): boolean {
  if (validWriteToken(value)) return true;
  if (typeof deviceId !== "string" || !deviceId) return false;
  try {
    const devices = JSON.parse(process.env.GADV_DEVICE_TOKENS || "{}");
    return devices !== null && !Array.isArray(devices) && Object.hasOwn(devices, deviceId) && tokenMatches(value, devices[deviceId]);
  } catch { return false; }
}

export const requireWriteAccess: RequestHandler = (req, res, next) => {
  if (!process.env.GADV_WRITE_TOKEN || process.env.GADV_WRITE_TOKEN.length < 32) {
    res.status(503).json({ message: "Administrative access is disabled until GADV_WRITE_TOKEN is configured (at least 32 characters)." });
    return;
  }
  if (!validWriteToken(bearerToken(req))) {
    res.status(401).json({ message: "A valid administrative access token is required." });
    return;
  }
  next();
};
