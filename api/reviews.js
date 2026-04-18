import { put, get, del } from "@vercel/blob";

const REVIEW_BLOB_PATH = "classic-critic/reviews.json";

const defaultReview = {
  id: "beethoven-7-kleiber",
  label: "Featured Review",
  rating: "5.0 / 5",
  title: "베토벤 교향곡 7번",
  subtitle: "Carlos Kleiber · Vienna Philharmonic",
  youtubeUrl: "",
  body:
    "이 연주는 리듬의 추진력과 구조적 긴장을 놀라울 만큼 우아하게 결합한다. 2악장의 장중한 호흡은 과장 없이 깊이를 확보하고, 종악장에서는 베토벤 특유의 광휘가 단단한 균형감 속에서 폭발한다."
};

function createId() {
  return `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeReview(review) {
  return {
    id: review.id || createId(),
    label: review.label || defaultReview.label,
    rating: review.rating || defaultReview.rating,
    title: review.title || defaultReview.title,
    subtitle: review.subtitle || defaultReview.subtitle,
    youtubeUrl: review.youtubeUrl || "",
    body: review.body || defaultReview.body
  };
}

async function readStreamAsText(stream) {
  return new Response(stream).text();
}

async function loadStoredReviews() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return [defaultReview];
  }

  try {
    const result = await get(REVIEW_BLOB_PATH, { access: "private" });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return [defaultReview];
    }

    const raw = await readStreamAsText(result.stream);
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [defaultReview];
    }

    return parsed.map((review) => normalizeReview(review));
  } catch (error) {
    return [defaultReview];
  }
}

async function saveStoredReviews(reviews) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  await put(REVIEW_BLOB_PATH, JSON.stringify(reviews, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json"
  });
}

function json(data, init = {}) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store"
    },
    ...init
  });
}

export async function GET() {
  const reviews = await loadStoredReviews();
  return json({ reviews });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const review = normalizeReview(payload.review || {});
    const reviews = await loadStoredReviews();
    const existingIndex = reviews.findIndex((item) => item.id === review.id);

    if (existingIndex >= 0) {
      reviews[existingIndex] = review;
    } else {
      reviews.unshift(review);
    }

    await saveStoredReviews(reviews);
    return json({ reviews, review });
  } catch (error) {
    return json(
      {
        error: "리뷰 저장에 실패했습니다.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get("id") || "";

    if (!reviewId) {
      return json({ error: "삭제할 리뷰 ID가 없습니다." }, { status: 400 });
    }

    const reviews = await loadStoredReviews();
    const nextReviews = reviews.filter((review) => review.id !== reviewId);

    if (nextReviews.length === 0) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(REVIEW_BLOB_PATH);
      }
      return json({ reviews: [] });
    }

    await saveStoredReviews(nextReviews);
    return json({ reviews: nextReviews });
  } catch (error) {
    return json(
      {
        error: "리뷰 삭제에 실패했습니다.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
