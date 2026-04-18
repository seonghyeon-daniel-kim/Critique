const REVIEW_STORAGE_KEY = "classic-critic-reviews";
const AUTH_STORAGE_KEY = "classic-critic-editor-auth";
const ADMIN_PASSWORD = "classiccritic-admin";

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

function loadReviews() {
  const saved = localStorage.getItem(REVIEW_STORAGE_KEY);

  if (!saved) {
    return [defaultReview];
  }

  try {
    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      return parsed.map((review) => normalizeReview(review));
    }

    if (parsed && typeof parsed === "object") {
      return [normalizeReview(parsed)];
    }
  } catch (error) {
    return [defaultReview];
  }

  return [defaultReview];
}

function saveReviews(reviews) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews));
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

function createReviewCard(review) {
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

function initViewerPage() {
  const list = document.querySelector("[data-review-list]");

  if (!list) {
    return;
  }

  const reviews = loadReviews();

  if (reviews.length === 0) {
    list.innerHTML = '<div class="review-card empty-state">아직 공개된 리뷰가 없습니다. 에디터 페이지에서 첫 리뷰를 작성하세요.</div>';
    return;
  }

  list.innerHTML = reviews.map((review) => createReviewCard(review)).join("");
}

function setEditorVisibility(isAuthenticated) {
  const gate = document.querySelector("[data-editor-gate]");
  const panel = document.querySelector("[data-editor-panel]");

  if (!gate || !panel) {
    return;
  }

  gate.classList.toggle("is-hidden", isAuthenticated);
  panel.classList.toggle("is-hidden", !isAuthenticated);
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
  const loginForm = document.querySelector("[data-login-form]");
  const loginMessage = document.querySelector("[data-login-message]");
  const editorForm = document.querySelector("[data-editor-form]");
  const logoutButton = document.querySelector("[data-logout-button]");
  const newReviewButton = document.querySelector("[data-new-review-button]");
  const deleteReviewButton = document.querySelector("[data-delete-review-button]");
  const isAuthenticated = localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  let reviews = loadReviews();
  let activeReviewId = reviews[0]?.id || "";

  setEditorVisibility(isAuthenticated);

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

    if (reviews.length > 0) {
      selectReview(reviews[0]);
    } else {
      startNewReview();
    }

    editorForm.addEventListener("input", () => {
      syncEditorPreview(getFormReview(editorForm));
    });

    editorForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const review = normalizeReview(getFormReview(editorForm));
      const existingIndex = reviews.findIndex((item) => item.id === review.id);

      if (existingIndex >= 0) {
        reviews[existingIndex] = review;
      } else {
        reviews = [review, ...reviews];
      }

      activeReviewId = review.id;
      saveReviews(reviews);
      populateEditorForm(editorForm, review);
      renderManagerList(reviews, activeReviewId);
      syncEditorPreview(review);
      setSaveMessage("리뷰가 저장되었습니다. 뷰어 페이지를 새로고침하면 반영됩니다.");
    });

    if (newReviewButton) {
      newReviewButton.addEventListener("click", () => {
        startNewReview();
      });
    }

    if (deleteReviewButton) {
      deleteReviewButton.addEventListener("click", () => {
        const reviewId = editorForm.elements.reviewId.value.trim();

        if (!reviewId) {
          setSaveMessage("아직 저장되지 않은 새 초안입니다.");
          return;
        }

        reviews = reviews.filter((review) => review.id !== reviewId);
        saveReviews(reviews);

        if (reviews.length > 0) {
          selectReview(reviews[0]);
        } else {
          startNewReview();
        }

        setSaveMessage("리뷰를 삭제했습니다.");
      });
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-review-select]");

      if (!button) {
        return;
      }

      const review = reviews.find((item) => item.id === button.dataset.reviewSelect);

      if (review) {
        selectReview(review);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const password = loginForm.elements.password.value;

      if (password === ADMIN_PASSWORD) {
        localStorage.setItem(AUTH_STORAGE_KEY, "true");
        loginForm.reset();
        if (loginMessage) {
          loginMessage.textContent = "";
        }
        setEditorVisibility(true);
        return;
      }

      if (loginMessage) {
        loginMessage.textContent = "비밀번호가 일치하지 않습니다.";
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setSaveMessage("");
      setEditorVisibility(false);
    });
  }
}

if (document.querySelector("[data-editor-form]")) {
  initEditorPage();
} else {
  initViewerPage();
}
