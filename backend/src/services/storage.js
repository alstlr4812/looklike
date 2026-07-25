import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

const DRIVER = process.env.STORAGE_DRIVER || "local";
const LOCAL_DIR = process.env.LOCAL_UPLOAD_DIR || "./uploads";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

fs.mkdirSync(LOCAL_DIR, { recursive: true });

let s3Client = null;
let PutObjectCommand = null;
let DeleteObjectCommand = null;

async function getS3() {
  if (s3Client) return s3Client;
  const mod = await import("@aws-sdk/client-s3");
  PutObjectCommand = mod.PutObjectCommand;
  DeleteObjectCommand = mod.DeleteObjectCommand;
  s3Client = new mod.S3Client({
    // Cloudflare R2는 region 값으로 "auto"를 사용해요.
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

/**
 * 이미지 버퍼를 저장하고 { key, url } 을 반환합니다.
 */
export async function saveImage(buffer, extension = "webp") {
  const key = `${Date.now()}-${nanoid(10)}.${extension}`;

  if (DRIVER === "s3") {
    // Cloudflare R2는 객체별 ACL을 쓰지 않고 버킷 단위 "Public Access" 설정으로 공개 여부를 정해요.
    // R2 버킷 설정에서 Public Access(r2.dev 서브도메인 또는 커스텀 도메인)를 켜두면
    // 여기서 ACL을 별도로 지정하지 않아도 S3_PUBLIC_URL_BASE로 바로 접근 가능해요.
    const client = await getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: `image/${extension}`,
      })
    );
    const base = (process.env.S3_PUBLIC_URL_BASE || "").replace(/\/$/, "");
    return { key, url: `${base}/${key}` };
  }

  // local driver
  const filePath = path.join(LOCAL_DIR, key);
  fs.writeFileSync(filePath, buffer);
  return { key, url: `${PUBLIC_BASE_URL}/uploads/${key}` };
}

export async function deleteImage(key) {
  if (!key) return;
  if (DRIVER === "s3") {
    const client = await getS3();
    await client.send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
    );
    return;
  }
  const filePath = path.join(LOCAL_DIR, key);
  fs.rm(filePath, { force: true }, () => {});
}

export const localUploadDir = LOCAL_DIR;
