const REVIEW_API_ENDPOINT = "/api/reviews";
const AUTH_API_ENDPOINT = "/api/auth";
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
    <article class="review-card" aria-label="${escapeHtml(review.title || "리뷰")}">
      <div class="review-meta">
        <span class="review-label">${escapeHtml(review.label)}</span>
        <span class="review-rating">${escapeHtml(review.rating)}</span>
      </div>
      <h2>${escapeHtml(review.title)}</h2>
      <p class="review-subtitle">${escapeHtml(review.subtitle)}</p>
      ${embedUrl ? `<div class="video-frame-wrap"><iframe class="video-frame" src="${escapeHtml(embedUrl)}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ""}
      <p class="review-body">${escapeHtml(review.body)}</p>
      ${editable ? `<div class="review-card-actions"><button type="button" class="review-inline-button" data-edit-review="${escapeHtml(review.id)}">수정</button></div>` : ""}
    </article>
  `;
}

function renderLoadingState() {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  list.innerHTML = `
    <section class="loading-state" aria-live="polite">
      <p class="loading-copy">악기들이 서로의 음을 맞추고 있습니다. 잠시만 기다려주세요.</p>
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
}

function renderEmptyState() {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  list.innerHTML = `
    <article class="review-card empty-state empty-state-card">
      <p class="empty-state-kicker">Awaiting The First Note</p>
      <h3>침묵으로 가득 찬 공간입니다.</h3>
      <p class="review-body">
        아직 첫 번째 연주가 기록되지 않았습니다. Edit 버튼을 눌러 첫 비평을 시작해 보세요.
      </p>
    </article>
  `;
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

  list.innerHTML = reviews.map((review) => createReviewCard(review, isEditMode)).join("");
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
        ? "API 응답이 JSON이 아닙니다. 정적 서버가 아니라 Vercel 환경에서 실행 중인지 확인하세요."
        : `서버 응답을 해석하지 못했습니다: ${snippet || "empty response"}`
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "요청 처리에 실패했습니다.");
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
    list.innerHTML = '<div class="empty-state">아직 리뷰가 없습니다. 새 리뷰를 작성해 첫 글을 올리세요.</div>';
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
  let reviews = [defaultReview];
  let activeReviewId = reviews[0]?.id || "";

  setGateVisibility(false);
  setEditorVisibility(false);

  if (editorForm) {
    const syncEditorPreview = (review) => {
      renderReview({
        ...defaultReview,
        ...review,
        title: review.title || "제목을 입력하세요",
        subtitle: review.subtitle || "연주 정보를 입력하세요",
        body: review.body || "리뷰 본문을 입력하면 여기에서 미리 볼 수 있습니다."
      });
    };

    const selectReview = (review) => {
      activeReviewId = review.id || "";
      populateEditorForm(editorForm, review);
      renderManagerList(reviews, activeReviewId);
      syncEditorPreview(review);
      setSaveMessage("");
    };

    const startNewReview = () => {
      activeReviewId = "";
      const draft = createEmptyReview();
      populateEditorForm(editorForm, draft);
      renderManagerList(reviews, activeReviewId);
      syncEditorPreview(draft);
      setSaveMessage("새 리뷰 초안을 작성 중입니다.");
    };

    const refreshReviews = async () => {
      try {
        reviews = await fetchReviews();
        renderViewerReviews(reviews);

        if (reviews.length > 0) {
          const activeReview = reviews.find((item) => item.id === activeReviewId) || reviews[0];
          selectReview(activeReview);
        } else {
          startNewReview();
        }
      } catch (error) {
        renderManagerList(reviews, activeReviewId);
        setSaveMessage("서버에서 리뷰를 불러오지 못했습니다.");
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
        setSaveMessage("리뷰를 저장하는 중입니다...");
        reviews = await saveReviewRequest(review);
        activeReviewId = review.id;
        populateEditorForm(editorForm, review);
        renderManagerList(reviews, activeReviewId);
        syncEditorPreview(review);
        renderViewerReviews(reviews);
        setSaveMessage("리뷰가 저장되었습니다. 다른 사용자도 이 리뷰를 볼 수 있습니다.");
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : "리뷰 저장에 실패했습니다.");
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
          setSaveMessage("아직 저장되지 않은 새 초안입니다.");
          return;
        }

        try {
          setSaveMessage("리뷰를 삭제하는 중입니다...");
          reviews = await deleteReviewRequest(reviewId);
          renderViewerReviews(reviews);

          if (reviews.length > 0) {
            selectReview(reviews[0]);
          } else {
            startNewReview();
          }

          setSaveMessage("리뷰를 삭제했습니다.");
        } catch (error) {
          setSaveMessage(error instanceof Error ? error.message : "리뷰 삭제에 실패했습니다.");
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

  if (editToggleButton) {
    editToggleButton.addEventListener("click", () => {
      if (!isAuthenticated) {
        if (!isAuthConfigured) {
          window.alert("EDIT_PASSWORD 환경변수가 설정되지 않았습니다.");
          return;
        }

        setGateVisibility(true);
        return;
      }

      isEditMode = !isEditMode;
      setGateVisibility(false);
      setEditorVisibility(isEditMode);
      renderViewerReviews(reviews);
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
          loginMessage.textContent = error instanceof Error ? error.message : "로그인에 실패했습니다.";
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
      editToggleButton.textContent = "Edit";
      setSaveMessage("");
    });
  }
}

renderLoadingState();

Promise.allSettled([fetchReviews(), fetchAuthStatus()]).then(([reviewsResult, authResult]) => {
  if (reviewsResult.status === "fulfilled") {
    renderViewerReviews(reviewsResult.value);
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
