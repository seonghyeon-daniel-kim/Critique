import { sql } from "@vercel/postgres";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAuthenticated, unauthorizedResponse } from "./_auth.js";

const REVIEW_TABLE = "classic_critic_reviews";
export const EDITOR_PICK_PREFIX = "editor-pick:";

const defaultReview = {
  id: "",
  label: "Review Draft",
  rating: "Unscored",
  title: "",
  subtitle: "",
  youtubeUrl: "",
  body: ""
};

function loadLocalEnvFile() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

function createId() {
  return `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeReview(review) {
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

export function isEditorPickRecord(review) {
  return String(review.id || "").startsWith(EDITOR_PICK_PREFIX);
}

function getStorageProvider() {
  if (process.env.POSTGRES_URL) {
    return "vercel-postgres";
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "supabase";
  }

  return "memory";
}

function getSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function mapRowToReview(row) {
  return normalizeReview({
    id: row.id,
    label: row.label,
    rating: row.rating,
    title: row.title,
    subtitle: row.subtitle,
    youtubeUrl: row.youtube_url ?? row.youtubeUrl ?? "",
    body: row.body
  });
}

async function ensurePostgresTable() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS ${REVIEW_TABLE} (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      rating TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      youtube_url TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function loadPostgresReviews() {
  await ensurePostgresTable();

  const { rows } = await sql.query(`
    SELECT id, label, rating, title, subtitle, youtube_url, body
    FROM ${REVIEW_TABLE}
    ORDER BY updated_at DESC, created_at DESC;
  `);

  return rows.map((row) => mapRowToReview(row));
}

async function savePostgresReview(review) {
  await ensurePostgresTable();

  await sql`
    INSERT INTO classic_critic_reviews (
      id, label, rating, title, subtitle, youtube_url, body
    )
    VALUES (
      ${review.id},
      ${review.label},
      ${review.rating},
      ${review.title},
      ${review.subtitle},
      ${review.youtubeUrl},
      ${review.body}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      label = EXCLUDED.label,
      rating = EXCLUDED.rating,
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      youtube_url = EXCLUDED.youtube_url,
      body = EXCLUDED.body,
      updated_at = NOW();
  `;
}

async function deletePostgresReview(reviewId) {
  await ensurePostgresTable();
  await sql`DELETE FROM classic_critic_reviews WHERE id = ${reviewId};`;
}

async function loadSupabaseReviews() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(REVIEW_TABLE)
    .select("id, label, rating, title, subtitle, youtube_url, body")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Supabase read failed. Confirm that the classic_critic_reviews table exists. ${error.message}`
    );
  }

  return (data || []).map((row) => mapRowToReview(row));
}

async function saveSupabaseReview(review) {
  const client = getSupabaseClient();
  const { error } = await client.from(REVIEW_TABLE).upsert(
    {
      id: review.id,
      label: review.label,
      rating: review.rating,
      title: review.title,
      subtitle: review.subtitle,
      youtube_url: review.youtubeUrl,
      body: review.body,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(
      `Supabase write failed. Check the classic_critic_reviews table and its permissions. ${error.message}`
    );
  }
}

async function deleteSupabaseReview(reviewId) {
  const client = getSupabaseClient();
  const { error } = await client.from(REVIEW_TABLE).delete().eq("id", reviewId);

  if (error) {
    throw new Error(`Supabase delete failed. ${error.message}`);
  }
}

export async function loadStoredReviews() {
  const provider = getStorageProvider();

  try {
    if (provider === "vercel-postgres") {
      const reviews = await loadPostgresReviews();
      return reviews.length > 0 ? reviews : [];
    }

    if (provider === "supabase") {
      const reviews = await loadSupabaseReviews();
      return reviews.length > 0 ? reviews : [];
    }

    return [];
  } catch (error) {
    return [];
  }
}

export async function saveStoredReview(review) {
  const provider = getStorageProvider();

  if (provider === "vercel-postgres") {
    await savePostgresReview(review);
    return;
  }

  if (provider === "supabase") {
    await saveSupabaseReview(review);
    return;
  }

  throw new Error(
    "No database is configured for saving. Set POSTGRES_URL or SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY."
  );
}

export async function deleteStoredReview(reviewId) {
  const provider = getStorageProvider();

  if (provider === "vercel-postgres") {
    await deletePostgresReview(reviewId);
    return;
  }

  if (provider === "supabase") {
    await deleteSupabaseReview(reviewId);
    return;
  }

  throw new Error(
    "No database is configured for deletion. Set POSTGRES_URL or SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY."
  );
}

function json(data, init = {}) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store"
    },
    ...init
  });
}

function toErrorPayload(message, error) {
  const details = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";

  console.error(message, {
    details,
    stack
  });

  return {
    error: message,
    details,
    provider: getStorageProvider()
  };
}

export async function GET() {
  const reviews = (await loadStoredReviews()).filter((review) => !isEditorPickRecord(review));
  return json({ reviews });
}

export async function POST(request) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const payload = await request.json();
    const review = normalizeReview(payload.review || {});
    await saveStoredReview(review);
    const reviews = (await loadStoredReviews()).filter((item) => !isEditorPickRecord(item));
    return json({ reviews, review });
  } catch (error) {
    return json(toErrorPayload("Could not save the review.", error), { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get("id") || "";

    if (!reviewId) {
      return json({ error: "No review ID was provided for deletion." }, { status: 400 });
    }

    await deleteStoredReview(reviewId);
    const reviews = (await loadStoredReviews()).filter((item) => !isEditorPickRecord(item));
    return json({ reviews });
  } catch (error) {
    return json(toErrorPayload("Could not delete the review.", error), { status: 500 });
  }
}
