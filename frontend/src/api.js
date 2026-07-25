const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

export async function fetchPosts(cursor) {
  const url = new URL(`${BASE_URL}/api/posts`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url);
  return handle(res);
}

export async function createPost({ fileA, fileB, labelA, labelB, caption, uploader }) {
  const form = new FormData();
  form.append("imageA", fileA);
  form.append("imageB", fileB);
  form.append("labelA", labelA || "");
  form.append("labelB", labelB || "");
  form.append("caption", caption || "");
  form.append("uploader", uploader || "");
  const res = await fetch(`${BASE_URL}/api/posts`, { method: "POST", body: form });
  return handle(res);
}

export async function reportPost(id, reason) {
  const res = await fetch(`${BASE_URL}/api/posts/${id}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return handle(res);
}

export async function deletePost(id, deleteToken) {
  const res = await fetch(`${BASE_URL}/api/posts/${id}`, {
    method: "DELETE",
    headers: { "X-Delete-Token": deleteToken },
  });
  return handle(res);
}
