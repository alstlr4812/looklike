import crypto from "node:crypto";

// IP를 그대로 저장하지 않고 해시로 저장 (신고 도배 방지용 식별만 목적)
export function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip)).digest("hex");
}

export function generateDeleteToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
