import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { localUploadDir } from "./services/storage.js";
import { initDb } from "./db.js";
import postsRouter from "./routes/posts.js";
import reportsRouter from "./routes/reports.js";
import adminRouter from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  })
);
app.use(express.json({ limit: "1mb" }));

// 로컬 저장 모드일 때 업로드된 이미지를 정적으로 서빙
// (S3/R2 사용 시에는 이 라인이 필요 없고, 이미지가 스토리지의 public URL로 바로 서빙됩니다)
if ((process.env.STORAGE_DRIVER || "local") === "local") {
  app.use("/uploads", express.static(path.resolve(localUploadDir)));
}

app.use(express.static(path.resolve("public"))); // /moderation.html 관리자 대시보드

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/posts", postsRouter);
app.use("/api/posts", reportsRouter); // /api/posts/:id/report
app.use("/admin", adminRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `사진 용량이 너무 커요. ${process.env.MAX_IMAGE_SIZE_MB || 20}MB 이하로 올려주세요.`,
    });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "서버 오류" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`LOOKLIKE backend listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB 초기화 실패:", err);
    process.exit(1);
  });
