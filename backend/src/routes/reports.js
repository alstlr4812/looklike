import express from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { getClientIp, hashIp } from "../services/util.js";

const router = express.Router();

const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "신고가 너무 잦아요. 잠시 후 다시 시도해주세요." },
});

const AUTO_HIDE_THRESHOLD = Number(process.env.AUTO_HIDE_REPORT_THRESHOLD || 3);
const VALID_REASONS = ["nudity", "violence", "spam", "copyright", "personal_info", "other"];

// POST /api/posts/:id/report  { reason }
router.post("/:id/report", reportLimiter, async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: "올바른 신고 사유를 선택해주세요." });
    }

    const { rows } = await pool.query("SELECT * FROM posts WHERE id = $1", [req.params.id]);
    const post = rows[0];
    if (!post || post.status === "removed") {
      return res.status(404).json({ error: "게시물을 찾을 수 없어요." });
    }

    const ip = hashIp(getClientIp(req));

    const dup = await pool.query(
      `SELECT 1 FROM reports WHERE post_id = $1 AND reporter_ip_hash = $2 AND created_at > $3`,
      [post.id, ip, Date.now() - 24 * 60 * 60 * 1000]
    );
    if (dup.rows.length > 0) {
      return res.status(429).json({ error: "이미 신고한 게시물이에요." });
    }

    await pool.query(
      "INSERT INTO reports (post_id, reason, reporter_ip_hash, created_at) VALUES ($1, $2, $3, $4)",
      [post.id, reason, ip, Date.now()]
    );

    const newCount = post.report_count + 1;
    const newStatus = newCount >= AUTO_HIDE_THRESHOLD ? "hidden" : post.status;

    await pool.query("UPDATE posts SET report_count = $1, status = $2 WHERE id = $3", [
      newCount,
      newStatus,
      post.id,
    ]);

    res.json({ ok: true, hidden: newStatus === "hidden" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "신고 처리 중 오류가 발생했어요." });
  }
});

export default router;
