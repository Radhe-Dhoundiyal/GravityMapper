import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export function validWriteToken(value: unknown): boolean {
  const expected = process.env.GADV_WRITE_TOKEN;
  if (!expected || expected.length < 32 || typeof value !== "string") return false;
  const candidate = Buffer.from(value);
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}

export const requireWriteAccess: RequestHandler = (req, res, next) => {
  if (!process.env.GADV_WRITE_TOKEN || process.env.GADV_WRITE_TOKEN.length < 32) {
    res.status(503).json({ message: "Writes are disabled until GADV_WRITE_TOKEN is configured (at least 32 characters)." });
    return;
  }
  if (!validWriteToken(req.headers.authorization?.replace(/^Bearer /, ""))) {
    res.status(401).json({ message: "A valid write access token is required." });
    return;
  }
  next();
};
