import {
  createLoginResponse,
  createLogoutResponse,
  isAuthConfigured,
  isAuthenticated,
  passwordMatches
} from "./_auth.js";

function json(data, init = {}) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store"
    },
    ...init
  });
}

export async function GET(request) {
  return json({
    configured: isAuthConfigured(),
    authenticated: isAuthenticated(request)
  });
}

export async function POST(request) {
  const payload = await request.json().catch(() => ({}));
  const password = String(payload.password || "");

  if (!isAuthConfigured()) {
    return json(
      {
        error: "EDIT_PASSWORD 환경변수가 설정되지 않았습니다."
      },
      { status: 500 }
    );
  }

  if (!passwordMatches(password)) {
    return json(
      {
        error: "비밀번호가 일치하지 않습니다."
      },
      { status: 401 }
    );
  }

  return createLoginResponse(request);
}

export async function DELETE(request) {
  return createLogoutResponse(request);
}
