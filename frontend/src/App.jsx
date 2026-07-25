import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPosts, createPost, reportPost, deletePost } from "./api.js";

const TOKENS_KEY = "looklike_my_post_tokens"; // { [postId]: deleteToken }
const REPORT_REASONS = [
  { value: "nudity", label: "선정적인 콘텐츠" },
  { value: "violence", label: "폭력적인 콘텐츠" },
  { value: "spam", label: "스팸/도배" },
  { value: "copyright", label: "저작권 침해" },
  { value: "personal_info", label: "개인정보 노출" },
  { value: "other", label: "기타" },
];

function loadMyTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveMyToken(postId, token) {
  const map = loadMyTokens();
  map[postId] = token;
  localStorage.setItem(TOKENS_KEY, JSON.stringify(map));
}

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function AdCard() {
  return (
    <div className="ad-card">
      <span className="tag">스폰서</span>
      <p className="title">여기에 광고가 노출됩니다</p>
      <p className="body">광고 네트워크 승인 후 실제 광고로 교체하세요</p>
    </div>
  );
}

function PostCard({ post, myTokens, onReport, onDelete }) {
  const [showReport, setShowReport] = useState(false);
  const canDelete = Boolean(myTokens[post.id]);

  return (
    <div className="card">
      <div className="pin" />
      <div className="imgs">
        <img src={post.imageA} alt={post.labelA || "사진 A"} loading="lazy" />
        <img src={post.imageB} alt={post.labelB || "사진 B"} loading="lazy" />
        <div className="eq-badge">≈</div>
      </div>
      <div className="labels-row">
        <span>{post.labelA || "사진 A"}</span>
        <span>{post.labelB || "사진 B"}</span>
      </div>
      {post.caption && <p className="caption">{post.caption}</p>}
      <div className="meta-row">
        <span>{post.uploader || "익명"}</span>
        <span>{formatTime(post.timestamp)}</span>
      </div>
      <div className="card-actions">
        <button className="report" onClick={() => setShowReport(true)}>
          신고
        </button>
        {canDelete && (
          <button className="delete" onClick={() => onDelete(post.id)}>
            삭제
          </button>
        )}
      </div>

      {showReport && (
        <ReportModal
          onClose={() => setShowReport(false)}
          onSubmit={async (reason) => {
            await onReport(post.id, reason);
            setShowReport(false);
          }}
        />
      )}
    </div>
  );
}

function ReportModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(reason);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <h2>신고하기</h2>
        <p className="sub">신고 사유를 선택해주세요</p>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {error && <p className="error-text">{error}</p>}
        <button className="btn danger" disabled={submitting} onClick={submit} style={{ width: "100%" }}>
          {submitting ? "신고 접수 중..." : "신고 제출"}
        </button>
      </div>
    </div>
  );
}

function ImagePicker({ label, preview, onPick }) {
  const ref = useRef(null);
  return (
    <div style={{ flex: 1 }}>
      <div className="picker" onClick={() => ref.current?.click()}>
        {preview ? <img src={preview} alt={label} /> : <span>{label}</span>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </div>
  );
}

function UploadModal({ onClose, onSubmit }) {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [previewA, setPreviewA] = useState(null);
  const [previewB, setPreviewB] = useState(null);
  const [labelA, setLabelA] = useState("");
  const [labelB, setLabelB] = useState("");
  const [caption, setCaption] = useState("");
  const [uploader, setUploader] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pick = (which, f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 올릴 수 있어요.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      if (which === "A") { setFileA(f); setPreviewA(reader.result); }
      else { setFileB(f); setPreviewB(reader.result); }
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!fileA || !fileB) { setError("두 장의 사진을 모두 올려주세요."); return; }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ fileA, fileB, labelA, labelB, caption, uploader });
      onClose();
    } catch (e) {
      setError(e.message || "업로드에 실패했어요.");
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <h2>닮은꼴 두 장 꽂기</h2>
        <p className="sub">서로 닮은 사진 두 장을 나란히 올려보세요</p>

        <div className="picker-row">
          <ImagePicker label="사진 A 선택" preview={previewA} onPick={(f) => pick("A", f)} />
          <ImagePicker label="사진 B 선택" preview={previewB} onPick={(f) => pick("B", f)} />
        </div>
        <div className="label-row">
          <input type="text" placeholder="A는 뭐예요? (선택)" maxLength={30} value={labelA} onChange={(e) => setLabelA(e.target.value)} />
          <input type="text" placeholder="B는 뭐예요? (선택)" maxLength={30} value={labelB} onChange={(e) => setLabelB(e.target.value)} />
        </div>
        <input type="text" placeholder="닉네임 (선택)" maxLength={30} value={uploader} onChange={(e) => setUploader(e.target.value)} />
        <textarea placeholder="어떻게 닮았는지 한마디 (선택)" maxLength={140} rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />

        {error && <p className="error-text">{error}</p>}

        <button className="btn" style={{ width: "100%" }} disabled={submitting} onClick={submit}>
          {submitting ? "게시 중..." : "게시판에 붙이기"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [myTokens, setMyTokens] = useState(loadMyTokens());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPosts();
      setPosts(data.posts);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError("게시물을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPosts(nextCursor);
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // 실패해도 조용히 무시 - 사용자는 버튼을 다시 누를 수 있음
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUpload = async (fields) => {
    const { post, deleteToken } = await createPost(fields);
    saveMyToken(post.id, deleteToken);
    setMyTokens(loadMyTokens());
    setPosts((prev) => [post, ...prev]);
  };

  const handleReport = async (id, reason) => {
    await reportPost(id, reason);
    // 신고 후에는 목록에서 즉시 제거해 중복 신고를 방지 (실제로는 서버가 최종 판단)
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDelete = async (id) => {
    if (!confirm("이 게시물을 삭제할까요?")) return;
    try {
      await deletePost(id, myTokens[id]);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert(e.message);
    }
  };

  const gridItems = [];
  posts.forEach((p, i) => {
    gridItems.push({ type: "post", data: p, key: p.id });
    if ((i + 1) % 4 === 0) gridItems.push({ type: "ad", key: `ad-${i}` });
  });

  return (
    <div className="board">
      <header className="header">
        <h1>🪞 LOOKLIKE</h1>
        <p>닮은 사진 두 장을 나란히 올리는 게시판</p>
      </header>

      <main className="main">
        <div className="banner-ad">
          <span className="tag">광고</span>
          <span>728×90 상단 배너 광고 영역</span>
          <span className="tag">Sponsored</span>
        </div>

        <div className="upload-btn-wrap">
          <button className="btn" onClick={() => setShowUpload(true)}>+ 닮은꼴 올리기</button>
        </div>

        {loading && <p className="state-msg">게시판을 불러오는 중...</p>}
        {!loading && error && <p className="state-msg">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="state-msg">아직 꽂힌 닮은꼴이 없어요. 첫 닮은꼴을 올려보세요!</p>
        )}

        {!loading && !error && posts.length > 0 && (
          <>
            <div className="grid">
              {gridItems.map((item) =>
                item.type === "post" ? (
                  <PostCard
                    key={item.key}
                    post={item.data}
                    myTokens={myTokens}
                    onReport={handleReport}
                    onDelete={handleDelete}
                  />
                ) : (
                  <AdCard key={item.key} />
                )
              )}
            </div>
            {nextCursor && (
              <div className="more-wrap">
                <button className="btn ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "불러오는 중..." : "더 보기"}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSubmit={handleUpload} />
      )}
    </div>
  );
}
