export function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ error: "서버에 ADMIN_API_KEY가 설정되지 않았습니다." });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "관리자 인증이 필요합니다." });
  }
  next();
}
