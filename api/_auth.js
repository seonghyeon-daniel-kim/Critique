import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_COOKIE_NAME = "classic_critic_editor_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

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

function getEditorPassword() {
  return process.env.EDIT_PASSWORD || "";
}

function getSessionSecret() {
  return process.env.EDIT_SESSION_SECRET || getEditorPassword();
}

function createCookieValue(request, token, maxAge) {
  const url = new URL(request.url);
  const secureAttribute = url.protocol === "https:" ? "; Secure" : "";

  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttribute}`;
}

function createSessionToken() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const payload = `${issuedAt}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token) {
    return false;
  }

  const [issuedAt, expiresAt, signature] = token.split(".");

  if (!issuedAt || !expiresAt || !signature) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  if (Number(expiresAt) < now) {
    return false;
  }

  const payload = `${issuedAt}.${expiresAt}`;
  const expectedSignature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";

  return header.split(";").reduce((cookies, part) => {
    const [rawKey, ...rawValueParts] = part.trim().split("=");

    if (!rawKey) {
      return cookies;
    }

    cookies[rawKey] = decodeURIComponent(rawValueParts.join("=") || "");
    return cookies;
  }, {});
}

export function isAuthConfigured() {
  return Boolean(getEditorPassword());
}

export function isAuthenticated(request) {
  if (!isAuthConfigured()) {
    return false;
  }

  const cookies = parseCookies(request);
  return verifySessionToken(cookies[AUTH_COOKIE_NAME] || "");
}

export function unauthorizedResponse() {
  return Response.json(
    {
      error: "편집 권한이 없습니다. 다시 로그인하세요."
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export function createLoginResponse(request) {
  const token = createSessionToken();

  return Response.json(
    {
      authenticated: true
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": createCookieValue(request, token, SESSION_TTL_SECONDS)
      }
    }
  );
}

export function createLogoutResponse(request) {
  return Response.json(
    {
      authenticated: false
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": createCookieValue(request, "", 0)
      }
    }
  );
}

export function passwordMatches(password) {
  const editorPassword = getEditorPassword();

  if (!editorPassword) {
    return false;
  }

  if (password.length !== editorPassword.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(editorPassword));
}
