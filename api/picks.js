import crypto from "node:crypto";
import {
  EDITOR_PICK_PREFIX,
  deleteStoredReview,
  isEditorPickRecord,
  loadStoredReviews,
  saveStoredReview
} from "./reviews.js";
import { isAuthenticated, unauthorizedResponse } from "./_auth.js";

const MAX_EDITOR_PICKS = 5;

function createPickId(reviewId) {
  return `${EDITOR_PICK_PREFIX}${reviewId}`;
}

function getReviewIdFromPickId(pickId) {
  return String(pickId || "").startsWith(EDITOR_PICK_PREFIX)
    ? String(pickId).slice(EDITOR_PICK_PREFIX.length)
    : "";
}

function normalizePick(review) {
  return {
    id: createPickId(review.id || crypto.randomUUID()),
    label: "Editor's Pick",
    rating: "Pick",
    title: review.title || "",
    subtitle: review.subtitle || "",
    youtubeUrl: review.youtubeUrl || "",
    body: review.body || ""
  };
}

function toPublicPick(review) {
  return {
    id: createPickId(review.id),
    reviewId: review.id,
    title: review.title,
    subtitle: review.subtitle,
    youtubeUrl: review.youtubeUrl,
    body: review.body
  };
}

function getCurrentPicks(records) {
  const selectedReviewIds = records
    .filter((review) => isEditorPickRecord(review))
    .map((pick) => getReviewIdFromPickId(pick.id));
  const reviewMap = new Map(
    records
      .filter((review) => !isEditorPickRecord(review))
      .map((review) => [review.id, review])
  );

  return selectedReviewIds
    .map((reviewId) => reviewMap.get(reviewId))
    .filter(Boolean)
    .map((review) => toPublicPick(review));
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
  const picks = getCurrentPicks(await loadStoredReviews());

  return json({ picks });
}

export async function POST(request) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const payload = await request.json();
    const reviewIds = Array.isArray(payload.reviewIds)
      ? [...new Set(payload.reviewIds.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];

    if (reviewIds.length > MAX_EDITOR_PICKS) {
      return json({ error: `You can select up to ${MAX_EDITOR_PICKS} Editor's Picks.` }, { status: 400 });
    }

    const records = await loadStoredReviews();
    const reviews = records.filter((review) => !isEditorPickRecord(review));
    const existingPickIds = new Set(
      records
        .filter((review) => isEditorPickRecord(review))
        .map((pick) => pick.id)
    );
    const reviewMap = new Map(reviews.map((review) => [review.id, review]));

    for (const reviewId of reviewIds) {
      if (!reviewMap.has(reviewId)) {
        return json({ error: "One or more selected reviews could not be found." }, { status: 400 });
      }
    }

    const nextPickIds = new Set(reviewIds.map((reviewId) => createPickId(reviewId)));

    for (const pickId of existingPickIds) {
      if (!nextPickIds.has(pickId)) {
        await deleteStoredReview(pickId);
      }
    }

    for (const reviewId of reviewIds) {
      await saveStoredReview(normalizePick(reviewMap.get(reviewId)));
    }

    const picks = getCurrentPicks(await loadStoredReviews());
    return json({ picks });
  } catch (error) {
    return json(
      {
        error: "Could not save Editor's Picks.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const pickId = searchParams.get("id") || createPickId(searchParams.get("reviewId") || "");

    if (!pickId) {
      return json({ error: "No Pick ID was provided for deletion." }, { status: 400 });
    }

    await deleteStoredReview(pickId);
    const picks = getCurrentPicks(await loadStoredReviews());

    return json({ picks });
  } catch (error) {
    return json(
      {
        error: "Could not delete the Editor's Pick.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
