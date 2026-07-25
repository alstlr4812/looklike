import express from "express";
import multer from "multer";
import sharp from "sharp";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { saveImage, deleteImage } from "../services/storage.js";
import { moderateImage, moderateText } from "../services/moderation.js";
import { generateDeleteToken, hashToken, getClientIp, hashIp } from "../services/util.js";

const router = express.Router();

const MAX_MB = Number(process.env.MAX_IMAGE_SIZE_MB || 20);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("이미지 파일만 업로드할 수 있습니다."));
    }
    cb(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10, // 10분당 10건
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "업로드가 너무 잦아요. 잠시 후 다시 시도해주세요." },
});

async function processImage(buffer) {
  // EXIF 메타데이터(위치정보 등) 제거 + 리사이즈 + webp 변환
  return sharp(buffer)
    .rotate() // EXIF orientation 반영 후 metadata 제거
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

// GET /api/posts?cursor=&limit=20  (공개 목록, visible 상태만)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor ? Number(req.query.cursor) : Date.now() + 1;

    const { rows } = await pool.query(
      `SELECT id, image_a_url, image_b_url, label_a, label_b, caption, uploader, created_at
       FROM posts
       WHERE status = 'visible' AND created_at < $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [cursor, limit]
    );

    const nextCursor = rows.length === limit ? Number(rows[rows.length - 1].created_at) : null;

    res.json({
      posts: rows.map((r) => ({
        id: r.id,
        imageA: r.image_a_url,
        imageB: r.image_b_url,
        labelA: r.label_a,
        labelB: r.label_b,
        caption: r.caption,
        uploader: r.uploader,
        timestamp: Number(r.created_at),
      })),
      nextCursor,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "게시물을 불러오지 못했어요." });
  }
});

// POST /api/posts  (multipart: imageA, imageB, labelA, labelB, caption, uploader)
router.post(
  "/",
  uploadLimiter,
  upload.fields([{ name: "imageA", maxCount: 1 }, { name: "imageB", maxCount: 1 }]),
  async (req, res) => {
    try {
      const fileA = req.files?.imageA?.[0];
      const fileB = req.files?.imageB?.[0];
      if (!fileA || !fileB) {
        return res.status(400).json({ error: "두 장의 사진을 모두 첨부해주세요." });
      }

      const { labelA = "", labelB = "", caption = "", uploader = "" } = req.body;

      const textCheck = moderateText(labelA, labelB, caption, uploader);
      if (!textCheck.allowed) {
        return res.status(422).json({ error: "게시글에 부적절한 표현이 포함되어 있어요." });
      }

      const [processedA, processedB] = await Promise.all([
        processImage(fileA.buffer),
        processImage(fileB.buffer),
      ]);

      const [modA, modB] = await Promise.all([
        moderateImage(processedA),
        moderateImage(processedB),
      ]);
      if (!modA.allowed || !modB.allowed) {
        return res
          .status(422)
          .json({ error: "이미지가 커뮤니티 가이드라인에 맞지 않아 게시할 수 없어요." });
      }

      const [savedA, savedB] = await Promise.all([
        saveImage(processedA, "webp"),
        saveImage(processedB, "webp"),
      ]);

      const id = nanoid(12);
      const deleteToken = generateDeleteToken();
      const now = Date.now();
      const ip = getClientIp(req);

      await pool.query(
        `INSERT INTO posts
          (id, image_a_url, image_b_url, image_a_key, image_b_key, label_a, label_b, caption, uploader, delete_token_hash, status, report_count, uploader_ip_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'visible', 0, $11, $12)`,
        [
          id,
          savedA.url,
          savedB.url,
          savedA.key,
          savedB.key,
          labelA.slice(0, 30),
          labelB.slice(0, 30),
          caption.slice(0, 140),
          uploader.slice(0, 30),
          hashToken(deleteToken),
          hashIp(ip),
          now,
        ]
      );

      res.status(201).json({
        post: {
          id,
          imageA: savedA.url,
          imageB: savedB.url,
          labelA,
          labelB,
          caption,
          uploader,
          timestamp: now,
        },
        // 이 토큰은 지금 한 번만 응답됩니다. 클라이언트가 저장해두어야 나중에 본인 게시물을 삭제할 수 있어요.
        deleteToken,
      });
    } catch (err) {
      console.error(err);
      if (err.message?.includes("이미지 파일만")) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "업로드 중 오류가 발생했어요." });
    }
  }
);

// DELETE /api/posts/:id  (header: X-Delete-Token) - 본인 게시물만 삭제 가능
router.delete("/:id", async (req, res) => {
  try {
    const token = req.headers["x-delete-token"];
    if (!token) return res.status(401).json({ error: "삭제 권한 토큰이 없어요." });

    const { rows } = await pool.query("SELECT * FROM posts WHERE id = $1", [req.params.id]);
    const post = rows[0];
    if (!post || post.status === "removed") {
      return res.status(404).json({ error: "게시물을 찾을 수 없어요." });
    }
    if (hashToken(token) !== post.delete_token_hash) {
      return res.status(403).json({ error: "이 게시물을 삭제할 권한이 없어요." });
    }

    await pool.query("UPDATE posts SET status = 'removed' WHERE id = $1", [post.id]);
    await Promise.all([deleteImage(post.image_a_key), deleteImage(post.image_b_key)]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "삭제 중 오류가 발생했어요." });
  }
});

export default router;
