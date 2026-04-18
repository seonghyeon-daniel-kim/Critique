const REVIEW_API_ENDPOINT = "/api/reviews";
const AUTH_API_ENDPOINT = "/api/auth";
const PICKS_API_ENDPOINT = "/api/picks";
const REVIEWS_PER_PAGE = 3;
const MAX_EDITOR_PICKS = 5;
const defaultReview = {
  id: "",
  label: "Review Draft",
  rating: "Unscored",
  title: "",
  subtitle: "",
  youtubeUrl: "",
  body: ""
};

let isEditMode = false;
let isAuthenticated = false;
let isAuthConfigured = false;
let editorPicks = [];
let currentReviewPage = 1;

function createEmptyReview() {
  return {
    id: "",
    label: "New Review",
    rating: "4.8 / 5",
    title: "",
    subtitle: "",
    youtubeUrl: "",
    body: ""
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

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

function toYoutubeEmbedUrl(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/embed/")[1] || "";
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/shorts/")[1] || "";
      }
    }

    if (host === "youtu.be") {
      videoId = parsed.pathname.replace("/", "");
    }

    if (!videoId) {
      return "";
    }

    videoId = videoId.split(/[?&/]/)[0];
    return `https://www.youtube.com/embed/${videoId}`;
  } catch (error) {
    return "";
  }
}

function createReviewCard(review, editable = false) {
  const embedUrl = toYoutubeEmbedUrl(review.youtubeUrl);

  return `
    <article class="review-card" aria-label="${escapeHtml(review.title || "Review")}">
      <div class="review-meta">
        <span class="review-label">${escapeHtml(review.label)}</span>
        <span class="review-rating">${escapeHtml(review.rating)}</span>
      </div>
      <h2>${escapeHtml(review.title)}</h2>
      <p class="review-subtitle">${escapeHtml(review.subtitle)}</p>
      ${embedUrl ? `<div class="video-frame-wrap"><iframe class="video-frame" src="${escapeHtml(embedUrl)}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ""}
      <p class="review-body">${escapeHtml(review.body)}</p>
      ${editable ? `<div class="review-card-actions"><button type="button" class="review-inline-button" data-edit-review="${escapeHtml(review.id)}">Edit</button></div>` : ""}
    </article>
  `;
}

function getReviewPageCount(reviews) {
  return Math.max(1, Math.ceil(reviews.length / REVIEWS_PER_PAGE));
}

function clampReviewPage(page, reviews) {
  return Math.min(Math.max(page, 1), getReviewPageCount(reviews));
}

function setReviewPage(page, reviews) {
  currentReviewPage = clampReviewPage(page, reviews);
}

function setReviewPageForReview(reviews, reviewId) {
  const reviewIndex = reviews.findIndex((review) => review.id === reviewId);

  if (reviewIndex === -1) {
    setReviewPage(currentReviewPage, reviews);
    return;
  }

  currentReviewPage = Math.floor(reviewIndex / REVIEWS_PER_PAGE) + 1;
}

function renderReviewPagination(reviews) {
  const pagination = document.querySelector("[data-review-pagination]");
  const prevButton = document.querySelector("[data-review-page-prev]");
  const nextButton = document.querySelector("[data-review-page-next]");
  const indicator = document.querySelector("[data-review-page-indicator]");

  if (!pagination || !prevButton || !nextButton || !indicator) {
    return;
  }

  const totalPages = getReviewPageCount(reviews);
  const hasReviews = reviews.length > 0;

  setReviewPage(currentReviewPage, reviews);

  pagination.hidden = !hasReviews;
  prevButton.disabled = !hasReviews || currentReviewPage <= 1;
  nextButton.disabled = !hasReviews || currentReviewPage >= totalPages;
  indicator.textContent = hasReviews ? `${currentReviewPage} / ${totalPages}` : "0 / 0";
}

function renderLoadingState() {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  list.innerHTML = `
    <section class="loading-state" aria-live="polite">
      <p class="loading-copy">Tuning the hall. Please wait a moment.</p>
      <div class="skeleton-list">
        ${Array.from({ length: 3 }, () => `
          <article class="review-card skeleton-card" aria-hidden="true">
            <div class="skeleton-line skeleton-meta"></div>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-subtitle"></div>
            <div class="skeleton-line skeleton-body"></div>
            <div class="skeleton-line skeleton-body short"></div>
          </article>
        `).join("")}
      </div>
    </section>
  `;

  renderReviewPagination([]);
}

function renderEmptyState() {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  list.innerHTML = `
    <article class="review-card empty-state empty-state-card">
      <p class="empty-state-kicker">Awaiting The First Note</p>
      <h3>The hall is still waiting for its first performance.</h3>
      <p class="review-body">
        No review has been published yet. Open Edit mode to write the first entry in the archive.
      </p>
    </article>
  `;

  renderReviewPagination([]);
}

function createEmptyPick() {
  return {
    id: "",
    title: "",
    subtitle: "",
    youtubeUrl: "",
    body: ""
  };
}

function renderPicks(picks) {
  const list = document.querySelector("[data-pick-list]");

  if (!list) {
    return;
  }

  if (picks.length === 0) {
    list.innerHTML = '<div class="pick-empty">No Editor\'s Picks have been selected yet.</div>';
    return;
  }

  list.innerHTML = picks
    .map(
      (pick) => `
        <article class="pick-item">
          <div class="pick-copy">
            <h3>${escapeHtml(pick.title || "Untitled Pick")}</h3>
            ${pick.subtitle ? `<p class="pick-subtitle">${escapeHtml(pick.subtitle)}</p>` : ""}
            ${pick.body ? `<p class="pick-body">${escapeHtml(pick.body)}</p>` : ""}
            ${pick.youtubeUrl ? `<a class="pick-link" href="${escapeHtml(pick.youtubeUrl)}" target="_blank" rel="noreferrer">Listen</a>` : ""}
          </div>
        </article>
      `
    )
    .join("");
}

function getPickReviewId(pick) {
  return pick.reviewId || String(pick.id || "").replace(/^editor-pick:/, "");
}

function syncEditorPicksWithReviews(reviews, picks) {
  const reviewMap = new Map(reviews.map((review) => [review.id, review]));

  return picks
    .map((pick) => reviewMap.get(getPickReviewId(pick)))
    .filter(Boolean)
    .map((review) => ({
      id: `editor-pick:${review.id}`,
      reviewId: review.id,
      title: review.title,
      subtitle: review.subtitle,
      youtubeUrl: review.youtubeUrl,
      body: review.body
    }));
}

function renderPickManager(reviews, picks) {
  const list = document.querySelector("[data-pick-manager-list]");
  const count = document.querySelector("[data-pick-count]");
  const selectedReviewIds = new Set(picks.map((pick) => getPickReviewId(pick)));
  const selectedCount = selectedReviewIds.size;

  if (count) {
    count.textContent = `${selectedCount} / ${MAX_EDITOR_PICKS} Selected`;
  }

  if (!list) {
    return;
  }

  if (reviews.length === 0) {
    list.innerHTML = '<div class="empty-state">Save a few reviews first, then choose up to five Editor\'s Picks.</div>';
    return;
  }

  list.innerHTML = reviews
    .map((review) => {
      const isChecked = selectedReviewIds.has(review.id);
      const isDisabled = !isChecked && selectedCount >= MAX_EDITOR_PICKS;

      return `
        <label class="pick-option${isChecked ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}">
          <input
            type="checkbox"
            name="pickReviewId"
            value="${escapeHtml(review.id)}"
            ${isChecked ? "checked" : ""}
            ${isDisabled ? "disabled" : ""}
          >
          <span class="pick-option-copy">
            <span class="pick-option-title">${escapeHtml(review.title)}</span>
            <span class="pick-option-meta">${escapeHtml(review.subtitle)}</span>
          </span>
        </label>
      `;
    })
    .join("");
}

function renderReview(review, scope = document) {
  const label = scope.querySelector("[data-review-label]");
  const rating = scope.querySelector("[data-review-rating]");
  const title = scope.querySelector("[data-review-title]");
  const subtitle = scope.querySelector("[data-review-subtitle]");
  const videoWrap = scope.querySelector("[data-video-wrap]");
  const videoFrame = scope.querySelector("[data-video-frame]");
  const body = scope.querySelector("[data-review-body]");

  if (label) label.textContent = review.label;
  if (rating) rating.textContent = review.rating;
  if (title) title.textContent = review.title;
  if (subtitle) subtitle.textContent = review.subtitle;
  if (videoWrap && videoFrame) {
    const embedUrl = toYoutubeEmbedUrl(review.youtubeUrl);
    videoWrap.classList.toggle("is-hidden", !embedUrl);
    if (embedUrl) {
      videoFrame.src = embedUrl;
    } else {
      videoFrame.src = "";
    }
  }
  if (body) body.textContent = review.body;
}

function renderViewerReviews(reviews) {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  if (reviews.length === 0) {
    renderEmptyState();
    return;
  }

  setReviewPage(currentReviewPage, reviews);
  const startIndex = (currentReviewPage - 1) * REVIEWS_PER_PAGE;
  const visibleReviews = reviews.slice(startIndex, startIndex + REVIEWS_PER_PAGE);

  list.innerHTML = `
    <div class="review-page">
      ${visibleReviews.map((review) => createReviewCard(review, isEditMode)).join("")}
    </div>
  `;

  renderReviewPagination(reviews);
}

function initViewerPage() {
  renderEmptyState();
}

async function fetchReviews() {
  const data = await requestJson(REVIEW_API_ENDPOINT, {
    cache: "no-store"
  });
  return Array.isArray(data.reviews) ? data.reviews.map((review) => normalizeReview(review)) : [defaultReview];
}

async function fetchPicks() {
  const data = await requestJson(PICKS_API_ENDPOINT, {
    cache: "no-store"
  });

  return Array.isArray(data.picks) ? data.picks : [];
}

async function saveReviewRequest(review) {
  const data = await requestJson(REVIEW_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ review })
  });

  return Array.isArray(data.reviews) ? data.reviews.map((item) => normalizeReview(item)) : [];
}

async function deleteReviewRequest(reviewId) {
  const data = await requestJson(`${REVIEW_API_ENDPOINT}?id=${encodeURIComponent(reviewId)}`, {
    method: "DELETE"
  });

  return Array.isArray(data.reviews) ? data.reviews.map((item) => normalizeReview(item)) : [];
}

async function savePickRequest(reviewIds) {
  const data = await requestJson(PICKS_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reviewIds })
  });

  return Array.isArray(data.picks) ? data.picks : [];
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    const snippet = raw.slice(0, 120).trim();
    throw new Error(
      snippet.startsWith("<") || snippet.startsWith("The page")
        ? "The API did not return JSON. Make sure you are running this in Vercel dev rather than a static file server."
        : `Could not parse the server response: ${snippet || "empty response"}`
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "The request could not be completed.");
  }

  return data;
}

async function fetchAuthStatus() {
  return requestJson(AUTH_API_ENDPOINT, {
    cache: "no-store"
  });
}

async function loginRequest(password) {
  return requestJson(AUTH_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
}

async function logoutRequest() {
  return requestJson(AUTH_API_ENDPOINT, {
    method: "DELETE"
  });
}

function setEditorVisibility(isVisible) {
  const panel = document.querySelector("[data-editor-panel]");

  if (!panel) {
    return;
  }

  panel.classList.toggle("is-hidden", !isVisible);
}

function setGateVisibility(isVisible) {
  const gate = document.querySelector("[data-editor-gate]");

  if (!gate) {
    return;
  }

  gate.classList.toggle("is-hidden", !isVisible);
}

function setSaveMessage(message) {
  const node = document.querySelector("[data-save-message]");

  if (node) {
    node.textContent = message;
  }
}

function updateEditorModeLabel(isEditing) {
  const node = document.querySelector("[data-editor-mode]");

  if (node) {
    node.textContent = isEditing ? "Edit Review" : "New Review";
  }
}

function populateEditorForm(form, review) {
  form.elements.reviewId.value = review.id || "";
  form.elements.label.value = review.label || "";
  form.elements.rating.value = review.rating || "";
  form.elements.title.value = review.title || "";
  form.elements.subtitle.value = review.subtitle || "";
  form.elements.youtubeUrl.value = review.youtubeUrl || "";
  form.elements.body.value = review.body || "";
  updateEditorModeLabel(Boolean(review.id));
}

function getFormReview(form) {
  return {
    id: form.elements.reviewId.value.trim(),
    label: form.elements.label.value.trim(),
    rating: form.elements.rating.value.trim(),
    title: form.elements.title.value.trim(),
    subtitle: form.elements.subtitle.value.trim(),
    youtubeUrl: form.elements.youtubeUrl.value.trim(),
    body: form.elements.body.value.trim()
  };
}

function renderManagerList(reviews, activeId) {
  const list = document.querySelector("[data-review-manager-list]");
  const count = document.querySelector("[data-review-count]");

  if (count) {
    count.textContent = `${reviews.length} Review${reviews.length === 1 ? "" : "s"}`;
  }

  if (!list) {
    return;
  }

  if (reviews.length === 0) {
    list.innerHTML = '<div class="empty-state">No reviews yet. Write a new piece and begin the archive.</div>';
    return;
  }

  list.innerHTML = reviews
    .map((review) => {
      const isActive = review.id === activeId;
      return `
        <button type="button" class="manager-item${isActive ? " is-active" : ""}" data-review-select="${escapeHtml(review.id)}">
          <span class="manager-item-title">${escapeHtml(review.title)}</span>
          <span class="manager-item-meta">${escapeHtml(review.subtitle)}</span>
        </button>
      `;
    })
    .join("");
}

function initEditorPage() {
  const editorForm = document.querySelector("[data-editor-form]");
  const newReviewButton = document.querySelector("[data-new-review-button]");
  const deleteReviewButton = document.querySelector("[data-delete-review-button]");
  const editToggleButton = document.querySelector("[data-edit-toggle]");
  const logoutButton = document.querySelector("[data-logout-button]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginMessage = document.querySelector("[data-login-message]");
  const loginCancelButton = document.querySelector("[data-login-cancel]");
  const pickForm = document.querySelector("[data-pick-form]");
  const pickMessage = document.querySelector("[data-pick-message]");
  let reviews = [defaultReview];
  let activeReviewId = reviews[0]?.id || "";

  setGateVisibility(false);
  setEditorVisibility(false);

  if (editorForm) {
    const syncEditorPreview = (review) => {
      renderReview({
        ...defaultReview,
        ...review,
        title: review.title || "Enter a title",
        subtitle: review.subtitle || "Add performer and recording details",
        body: review.body || "Your review text will appear here as you write."
      });
    };

    const selectReview = (review) => {
      activeReviewId = review.id || "";
      populateEditorForm(editorForm, review);
      renderManagerList(reviews, activeReviewId);
      renderPickManager(reviews, editorPicks);
      syncEditorPreview(review);
      setSaveMessage("");
    };

    const startNewReview = () => {
      activeReviewId = "";
      const draft = createEmptyReview();
      populateEditorForm(editorForm, draft);
      renderManagerList(reviews, activeReviewId);
      renderPickManager(reviews, editorPicks);
      syncEditorPreview(draft);
      setSaveMessage("Drafting a new review.");
    };

    const refreshReviews = async () => {
      try {
        reviews = await fetchReviews();
        editorPicks = syncEditorPicksWithReviews(reviews, editorPicks);
        renderViewerReviews(reviews);
        renderPicks(editorPicks);
        renderPickManager(reviews, editorPicks);

        if (reviews.length > 0) {
          const activeReview = reviews.find((item) => item.id === activeReviewId) || reviews[0];
          selectReview(activeReview);
        } else {
          startNewReview();
        }
      } catch (error) {
        renderManagerList(reviews, activeReviewId);
        renderPickManager(reviews, editorPicks);
        setSaveMessage("Could not load reviews from the server.");
      }
    };

    refreshReviews();

    editorForm.addEventListener("input", () => {
      syncEditorPreview(getFormReview(editorForm));
    });

    editorForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const review = normalizeReview(getFormReview(editorForm));

      try {
        setSaveMessage("Saving review...");
        reviews = await saveReviewRequest(review);
        activeReviewId = review.id;
        setReviewPageForReview(reviews, review.id);
        editorPicks = syncEditorPicksWithReviews(reviews, editorPicks);
        populateEditorForm(editorForm, review);
        renderManagerList(reviews, activeReviewId);
        renderPickManager(reviews, editorPicks);
        syncEditorPreview(review);
        renderViewerReviews(reviews);
        renderPicks(editorPicks);
        setSaveMessage("Review saved. It is now visible to other readers.");
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : "Could not save the review.");
      }
    });

    if (newReviewButton) {
      newReviewButton.addEventListener("click", () => {
        startNewReview();
      });
    }

    if (deleteReviewButton) {
      deleteReviewButton.addEventListener("click", async () => {
        const reviewId = editorForm.elements.reviewId.value.trim();

        if (!reviewId) {
          setSaveMessage("This draft has not been saved yet.");
          return;
        }

        try {
          setSaveMessage("Deleting review...");
          reviews = await deleteReviewRequest(reviewId);
          setReviewPage(currentReviewPage, reviews);
          editorPicks = syncEditorPicksWithReviews(reviews, editorPicks);
          renderViewerReviews(reviews);
          renderPicks(editorPicks);
          renderPickManager(reviews, editorPicks);

          if (reviews.length > 0) {
            selectReview(reviews[0]);
          } else {
            startNewReview();
          }

          setSaveMessage("Review deleted.");
        } catch (error) {
          setSaveMessage(error instanceof Error ? error.message : "Could not delete the review.");
        }
      });
    }

    document.addEventListener("click", (event) => {
      const selectButton = event.target.closest("[data-review-select]");
      const editButton = event.target.closest("[data-edit-review]");

      if (editButton) {
        const review = reviews.find((item) => item.id === editButton.dataset.editReview);

        if (review) {
          if (!isEditMode) {
            isEditMode = true;
            setEditorVisibility(true);
            renderViewerReviews(reviews);
            if (editToggleButton) {
              editToggleButton.textContent = "Done";
            }
          }

          selectReview(review);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }

        return;
      }

      if (!selectButton) {
        return;
      }

      const review = reviews.find((item) => item.id === selectButton.dataset.reviewSelect);

      if (review) {
        selectReview(review);
      }
    });
  }

  document.addEventListener("click", (event) => {
    const prevButton = event.target.closest("[data-review-page-prev]");
    const nextButton = event.target.closest("[data-review-page-next]");

    if (prevButton) {
      setReviewPage(currentReviewPage - 1, reviews);
      renderViewerReviews(reviews);
      return;
    }

    if (nextButton) {
      setReviewPage(currentReviewPage + 1, reviews);
      renderViewerReviews(reviews);
    }
  });

  if (pickForm) {
    pickForm.addEventListener("change", (event) => {
      const selectedReviewIds = new FormData(pickForm).getAll("pickReviewId");

      if (selectedReviewIds.length > MAX_EDITOR_PICKS && event.target instanceof HTMLInputElement) {
        event.target.checked = false;
      }

      renderPickManager(
        reviews,
        new FormData(pickForm).getAll("pickReviewId").slice(0, MAX_EDITOR_PICKS).map((reviewId) => ({
          id: `editor-pick:${reviewId}`,
          reviewId: String(reviewId)
        }))
      );

      if (pickMessage) {
        pickMessage.textContent = "";
      }
    });

    pickForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const reviewIds = new FormData(pickForm)
        .getAll("pickReviewId")
        .map((value) => String(value));

      try {
        if (pickMessage) {
          pickMessage.textContent = "Updating Editor's Picks...";
        }

        editorPicks = await savePickRequest(reviewIds);
        editorPicks = syncEditorPicksWithReviews(reviews, editorPicks);
        renderPickManager(reviews, editorPicks);
        renderPicks(editorPicks);

        if (pickMessage) {
          pickMessage.textContent = "Editor's Picks updated.";
        }
      } catch (error) {
        if (pickMessage) {
          pickMessage.textContent =
            error instanceof Error ? error.message : "Could not update Editor's Picks.";
        }
      }
    });
  }

  if (editToggleButton) {
    editToggleButton.addEventListener("click", () => {
      if (!isAuthenticated) {
        if (!isAuthConfigured) {
          window.alert("The EDIT_PASSWORD environment variable is not configured.");
          return;
        }

        setGateVisibility(true);
        return;
      }

      isEditMode = !isEditMode;
      setGateVisibility(false);
      setEditorVisibility(isEditMode);
      renderViewerReviews(reviews);
      renderPicks(editorPicks);
      renderPickManager(reviews, editorPicks);
      editToggleButton.textContent = isEditMode ? "Done" : "Edit";

      if (!isEditMode) {
        setSaveMessage("");
        return;
      }

      const activeReview = reviews.find((item) => item.id === activeReviewId) || reviews[0];

      if (activeReview) {
        const previewReview = activeReview.id ? activeReview : defaultReview;
        populateEditorForm(editorForm, previewReview);
        renderManagerList(reviews, activeReviewId);
        renderReview(previewReview);
      } else {
        populateEditorForm(editorForm, createEmptyReview());
        renderManagerList(reviews, "");
        renderReview(defaultReview);
      }
    });
  }

  if (loginCancelButton) {
    loginCancelButton.addEventListener("click", () => {
      setGateVisibility(false);
      if (loginMessage) {
        loginMessage.textContent = "";
      }
      if (loginForm) {
        loginForm.reset();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const password = loginForm.elements.password.value.trim();

      try {
        await loginRequest(password);
        isAuthenticated = true;
        isEditMode = true;
        setGateVisibility(false);
        setEditorVisibility(true);
        renderViewerReviews(reviews);
        editToggleButton.textContent = "Done";
        loginForm.reset();
        if (loginMessage) {
          loginMessage.textContent = "";
        }

        const activeReview = reviews.find((item) => item.id === activeReviewId) || reviews[0];
        if (activeReview) {
          populateEditorForm(editorForm, activeReview);
          renderManagerList(reviews, activeReviewId);
          renderReview(activeReview);
        }
      } catch (error) {
        if (loginMessage) {
          loginMessage.textContent = error instanceof Error ? error.message : "Login failed.";
        }
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await logoutRequest();
      } catch (error) {
        // Ignore logout network errors and still lock the UI locally.
      }

      isAuthenticated = false;
      isEditMode = false;
      setGateVisibility(false);
      setEditorVisibility(false);
      renderViewerReviews(reviews);
      renderPicks(editorPicks);
      editToggleButton.textContent = "Edit";
      setSaveMessage("");
    });
  }
}

renderLoadingState();
renderPicks([]);

Promise.allSettled([fetchReviews(), fetchPicks(), fetchAuthStatus()]).then(
  ([reviewsResult, picksResult, authResult]) => {
  if (reviewsResult.status === "fulfilled") {
    const syncedPicks =
      picksResult.status === "fulfilled"
        ? syncEditorPicksWithReviews(reviewsResult.value, picksResult.value)
        : [];
    editorPicks = syncedPicks;
    setReviewPage(1, reviewsResult.value);
    renderViewerReviews(reviewsResult.value);
    renderPicks(editorPicks);
  } else {
    initViewerPage();
  }

  if (authResult.status === "fulfilled") {
    isAuthenticated = Boolean(authResult.value.authenticated);
    isAuthConfigured = Boolean(authResult.value.configured);
  }

  if (document.querySelector("[data-editor-form]")) {
    initEditorPage();
  }
});
