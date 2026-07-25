/**
 * 콘텐츠 모더레이션
 * -------------------------------------------------------------
 * 이미지: Sightengine API(https://sightengine.com)를 기본 연동 예시로 제공합니다.
 *   - 무료 티어로 시작 가능, 누드/폭력/약물 등 카테고리별 점수를 반환합니다.
 *   - .env 에 SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET 를 설정하면 활성화됩니다.
 *   - 값이 비어있으면 검열을 건너뛰고 통과시키므로, 실서비스 배포 전 반드시 설정하세요.
 *   - AWS Rekognition(DetectModerationLabels)이나 Google Cloud Vision SafeSearch로
 *     교체하려면 moderateImage() 내부 구현만 바꾸면 됩니다.
 *
 * 텍스트: 간단한 금칙어 필터를 기본 제공합니다. 실서비스에서는 OpenAI Moderation API 등
 *   더 정교한 서비스로 교체하는 것을 권장합니다 (아래 moderateText 주석 참고).
 * -------------------------------------------------------------
 */

const SIGHTENGINE_USER = process.env.SIGHTENGINE_API_USER;
const SIGHTENGINE_SECRET = process.env.SIGHTENGINE_API_SECRET;

// 임계값 (0~1). 넘으면 업로드 거부.
const THRESHOLDS = {
  nudity: 0.5,
  violence: 0.5,
  gore: 0.5,
};

export async function moderateImage(buffer) {
  if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) {
    console.warn(
      "[moderation] SIGHTENGINE_API_USER/SECRET 미설정 - 이미지 검열이 비활성화된 상태입니다."
    );
    return { allowed: true, skipped: true };
  }

  try {
    const form = new FormData();
    form.append(
      "media",
      new Blob([buffer]),
      "image.jpg"
    );
    form.append("models", "nudity-2.1,violence,gore");
    form.append("api_user", SIGHTENGINE_USER);
    form.append("api_secret", SIGHTENGINE_SECRET);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });
    const data = await res.json();

    const nudityScore = data?.nudity?.raw ?? data?.nudity?.sexual_activity ?? 0;
    const violenceScore = data?.violence?.prob ?? 0;
    const goreScore = data?.gore?.prob ?? 0;

    const flagged =
      nudityScore > THRESHOLDS.nudity ||
      violenceScore > THRESHOLDS.violence ||
      goreScore > THRESHOLDS.gore;

    return {
      allowed: !flagged,
      skipped: false,
      scores: { nudity: nudityScore, violence: violenceScore, gore: goreScore },
    };
  } catch (err) {
    console.error("[moderation] 이미지 검열 API 호출 실패:", err.message);
    // 검열 서비스 장애 시 정책 선택: 여기서는 안전하게 '차단'보다는 '통과 후 신고 대응'을 택함.
    // 엄격하게 운영하려면 allowed: false 로 바꾸세요.
    return { allowed: true, skipped: true, error: true };
  }
}

const BAD_WORDS = [
  "씨발", "개새끼", "병신", "지랄", "좆", "fuck", "nigger", "cunt",
];

export function moderateText(...texts) {
  const joined = texts.filter(Boolean).join(" ").toLowerCase();
  const hit = BAD_WORDS.find((w) => joined.includes(w.toLowerCase()));
  return { allowed: !hit, matched: hit || null };

  // OpenAI Moderation API로 교체하는 예시:
  // const res = await fetch("https://api.openai.com/v1/moderations", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ input: joined }),
  // });
  // const data = await res.json();
  // return { allowed: !data.results[0].flagged, matched: data.results[0].categories };
}
