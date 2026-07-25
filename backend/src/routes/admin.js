import express from "express";
import { pool } from "../db.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { deleteImage } from "../services/storage.js";

const router = express.Router();
router.use(adminAuth);

// GET /admin/posts?status=hidden|visible|removed  - 검토 대기열
router.get("/posts", async (req, res) => {
  try {
    const status = req.query.status || "hidden";
    const { rows } = await pool.query(
      `SELECT * FROM posts WHERE status = $1 ORDER BY report_count DESC, created_at DESC LIMIT 100`,
      [status]
    );
    res.json({ posts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "목록을 불러오지 못했어요." });
  }
});

// GET /admin/posts/:id/reports - 특정 게시물의 신고 내역
router.get("/posts/:id/reports", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT reason, created_at FROM reports WHERE post_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json({ reports: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "신고 내역을 불러오지 못했어요." });
  }
});

// POST /admin/posts/:id/restore - 신고 큐에서 복구(다시 공개)
router.post("/posts/:id/restore", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE posts SET status = 'visible', report_count = 0 WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "게시물을 찾을 수 없어요." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "복구 중 오류가 발생했어요." });
  }
});

// DELETE /admin/posts/:id - 완전 삭제 (이미지 파일 포함)
router.delete("/posts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM posts WHERE id = $1", [req.params.id]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: "게시물을 찾을 수 없어요." });

    await pool.query("UPDATE posts SET status = 'removed' WHERE id = $1", [post.id]);
    await Promise.all([deleteImage(post.image_a_key), deleteImage(post.image_b_key)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "삭제 중 오류가 발생했어요." });
  }
});

export default router;
