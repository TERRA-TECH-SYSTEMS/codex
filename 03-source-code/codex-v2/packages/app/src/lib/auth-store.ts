// ============================================================================
// CodeEX v2 — Authentication Store
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Manages user authentication state, JWT decoding, token refresh,
// user profile, session management, and logout.
//
// Designed with clean abstraction for future database connection:
//   - Currently reads user claims from JWT access token (Kloak OIDC)
//   - UserProfile interface is database-ready (sub, name, email, roles, etc.)
//   - Token refresh loop maintains session continuity
//   - All user state flows through reactive SolidJS signals
//
// Future: Replace JWT decode with API call to user service/database.
// ============================================================================

import { createSignal } from "solid-js";
import type { UserProfile, AuthStatus } from "./types";

// ============================================================================
// Kloak OIDC Configuration (shared with LoginPage.tsx)
// ============================================================================

const KLOAK_REALM = "terratech";
const KLOAK_CLIENT_ID = "codex";
const KLOAK_BASE_URL = "https://kloak.terratech.systems";
const KLOAK_ISSUER = `${KLOAK_BASE_URL}/realms/${KLOAK_REALM}`;
const KLOAK_TOKEN_URL = `${KLOAK_ISSUER}/protocol/openid-connect/token`;
const KLOAK_USERINFO_URL = `${KLOAK_ISSUER}/protocol/openid-connect/userinfo`;
const KLOAK_LOGOUT_URL = `${KLOAK_ISSUER}/protocol/openid-connect/logout`;

// ============================================================================
// Reactive State
// ============================================================================

const [userProfile, setUserProfile] = createSignal<UserProfile | null>(null);
const [authStatus, setAuthStatus] = createSignal<AuthStatus>("unauthenticated");
const [sessionExpiresAt, setSessionExpiresAt] = createSignal<number | null>(null);
const [lastActivity, setLastActivity] = createSignal<number>(Date.now());

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// Idle timeout: 30 minutes of no activity
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
// Refresh buffer: refresh token 60 seconds before expiry
const REFRESH_BUFFER_MS = 60 * 1000;

// ============================================================================
// JWT Decode (base64url → JSON claims)
// ============================================================================

function decodeJWT(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Extract UserProfile from JWT access token claims. */
function extractProfileFromJWT(token: string): UserProfile | null {
  const claims = decodeJWT(token);
  if (!claims) return null;

  return {
    sub: claims.sub ?? "",
    name: claims.name ?? claims.preferred_username ?? "User",
    email: claims.email ?? "",
    preferredUsername: claims.preferred_username,
    avatar: claims.picture ?? null,
    roles: extractRoles(claims),
    organization: claims.organization ?? claims.azp ?? "",
    emailVerified: claims.email_verified ?? false,
    locale: claims.locale,
    createdAt: claims.auth_time ? claims.auth_time * 1000 : undefined,
  };
}

/** Extract roles from Kloak JWT (realm_access + resource_access). */
function extractRoles(claims: Record<string, any>): string[] {
  const roles: string[] = [];
  // Realm roles
  if (claims.realm_access?.roles) {
    roles.push(...claims.realm_access.roles);
  }
  // Client-specific roles
  if (claims.resource_access?.[KLOAK_CLIENT_ID]?.roles) {
    roles.push(...claims.resource_access[KLOAK_CLIENT_ID].roles);
  }
  return roles;
}

/** Get token expiry time in milliseconds. */
function getTokenExpiry(token: string): number | null {
  const claims = decodeJWT(token);
  if (!claims?.exp) return null;
  return claims.exp * 1000; // JWT exp is in seconds
}

// ============================================================================
// Gravatar fallback (when no avatar URL in JWT)
// ============================================================================

function getGravatarUrl(email: string, size = 80): string {
  // Simple hash for Gravatar — uses identicon as default
  const hash = email.trim().toLowerCase();
  // Note: Real Gravatar uses MD5 hash. For now, use initials fallback in UI.
  // When database is connected, avatar URL will come from user record.
  return `https://www.gravatar.com/avatar/?d=identicon&s=${size}`;
}

// ============================================================================
// User Initials (for avatar fallback)
// ============================================================================

export function getUserInitials(profile: UserProfile | null): string {
  if (!profile?.name) return "?";
  const parts = profile.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

// ============================================================================
// Initialize Auth State
// ============================================================================

/** Initialize auth from stored session. Call on app load. */
export function initAuth(): boolean {
  const token = sessionStorage.getItem("codex_access_token");
  if (!token) {
    setAuthStatus("unauthenticated");
    setUserProfile(null);
    return false;
  }

  // Dev bypass token — create a default profile
  if (token === "dev-bypass-token") {
    setUserProfile({
      sub: "dev-user",
      name: "Developer",
      email: "dev@terratech.systems",
      preferredUsername: "developer",
      roles: ["admin"],
      organization: "TerraTech Systems",
      emailVerified: true,
    });
    setAuthStatus("authenticated");
    return true;
  }

  // Real JWT — decode and extract profile
  const profile = extractProfileFromJWT(token);
  if (profile) {
    setUserProfile(profile);
    setAuthStatus("authenticated");

    // Set up token expiry tracking
    const expiry = getTokenExpiry(token);
    if (expiry) {
      setSessionExpiresAt(expiry);
      scheduleTokenRefresh(expiry);
    }

    // Start idle tracking
    startIdleTracking();

    return true;
  }

  // Token exists but can't be decoded — still allow access (graceful degradation)
  setUserProfile({
    sub: "unknown",
    name: "User",
    email: "",
    preferredUsername: "user",
  });
  setAuthStatus("authenticated");
  return true;
}

// ============================================================================
// Login Callback — Called after successful authentication
// ============================================================================

/** Process login result. Call after LoginPage successfully authenticates. */
export function processLogin(): UserProfile | null {
  const token = sessionStorage.getItem("codex_access_token");
  if (!token) return null;

  // Dev bypass
  if (token === "dev-bypass-token") {
    const profile: UserProfile = {
      sub: "dev-user",
      name: "Developer",
      email: "dev@terratech.systems",
      preferredUsername: "developer",
      roles: ["admin"],
      organization: "TerraTech Systems",
      emailVerified: true,
    };
    setUserProfile(profile);
    setAuthStatus("authenticated");
    return profile;
  }

  // Decode JWT
  const profile = extractProfileFromJWT(token);
  if (profile) {
    setUserProfile(profile);
    setAuthStatus("authenticated");

    const expiry = getTokenExpiry(token);
    if (expiry) {
      setSessionExpiresAt(expiry);
      scheduleTokenRefresh(expiry);
    }

    startIdleTracking();

    // Fetch userinfo for complete profile (avatar, etc.)
    fetchUserInfo(token).catch(() => {});

    return profile;
  }

  return null;
}

// ============================================================================
// Userinfo Endpoint (enriches profile with full claims)
// ============================================================================

async function fetchUserInfo(token: string): Promise<void> {
  try {
    const res = await fetch(KLOAK_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const info = await res.json();

    // Merge userinfo into profile
    setUserProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: info.name ?? prev.name,
        email: info.email ?? prev.email,
        preferredUsername: info.preferred_username ?? prev.preferredUsername,
        avatar: info.picture ?? prev.avatar,
        emailVerified: info.email_verified ?? prev.emailVerified,
        locale: info.locale ?? prev.locale,
      };
    });
  } catch {
    // Userinfo fetch is best-effort — profile from JWT is sufficient
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

function scheduleTokenRefresh(expiresAt: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const now = Date.now();
  const delay = Math.max(0, expiresAt - now - REFRESH_BUFFER_MS);

  refreshTimer = setTimeout(async () => {
    await refreshToken();
  }, delay);
}

async function refreshToken(): Promise<boolean> {
  const refresh = sessionStorage.getItem("codex_refresh_token");
  if (!refresh) {
    // No refresh token — session will expire
    handleSessionExpired();
    return false;
  }

  setAuthStatus("refreshing");

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: KLOAK_CLIENT_ID,
      refresh_token: refresh,
    });

    const res = await fetch(KLOAK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      handleSessionExpired();
      return false;
    }

    const tokens = await res.json();
    sessionStorage.setItem("codex_access_token", tokens.access_token);
    if (tokens.refresh_token) {
      sessionStorage.setItem("codex_refresh_token", tokens.refresh_token);
    }

    // Update profile from new token
    const profile = extractProfileFromJWT(tokens.access_token);
    if (profile) setUserProfile(profile);

    // Schedule next refresh
    const expiry = getTokenExpiry(tokens.access_token);
    if (expiry) {
      setSessionExpiresAt(expiry);
      scheduleTokenRefresh(expiry);
    }

    setAuthStatus("authenticated");
    return true;
  } catch {
    handleSessionExpired();
    return false;
  }
}

// ============================================================================
// Session Expiry
// ============================================================================

function handleSessionExpired(): void {
  setAuthStatus("expired");
  // Dispatch event so App.tsx can show session expired dialog
  window.dispatchEvent(new CustomEvent("codex:session-expired"));
}

// ============================================================================
// Idle Tracking
// ============================================================================

function startIdleTracking(): void {
  const resetIdle = () => {
    setLastActivity(Date.now());
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      handleSessionExpired();
    }, IDLE_TIMEOUT_MS);
  };

  // Track user activity
  document.addEventListener("mousedown", resetIdle);
  document.addEventListener("keydown", resetIdle);
  document.addEventListener("scroll", resetIdle, { passive: true });
  document.addEventListener("touchstart", resetIdle, { passive: true });

  // Start the timer
  resetIdle();
}

// ============================================================================
// Logout
// ============================================================================

/** Sign out — clear session, optionally call Kloak logout endpoint. */
export async function logout(options?: { redirectToLogin?: boolean }): Promise<void> {
  // Clear tokens
  sessionStorage.removeItem("codex_access_token");
  sessionStorage.removeItem("codex_refresh_token");
  sessionStorage.removeItem("codex_oidc_state");
  sessionStorage.removeItem("codex_oidc_verifier");

  // Clear timers
  if (refreshTimer) clearTimeout(refreshTimer);
  if (idleTimer) clearTimeout(idleTimer);
  refreshTimer = null;
  idleTimer = null;

  // Reset state
  setUserProfile(null);
  setAuthStatus("unauthenticated");
  setSessionExpiresAt(null);

  // Attempt Kloak server-side logout (best-effort)
  try {
    const idToken = sessionStorage.getItem("codex_id_token");
    if (idToken) {
      const logoutUrl = new URL(KLOAK_LOGOUT_URL);
      logoutUrl.searchParams.set("id_token_hint", idToken);
      logoutUrl.searchParams.set("post_logout_redirect_uri", window.location.origin + window.location.pathname);
      // Fire and forget — don't block logout on server response
      fetch(logoutUrl.toString(), { mode: "no-cors" }).catch(() => {});
    }
  } catch {
    // Server-side logout is best-effort
  }

  // Notify app
  window.dispatchEvent(new CustomEvent("codex:logout"));

  // Optionally redirect (for Kloak SSO full logout)
  if (options?.redirectToLogin) {
    window.location.reload();
  }
}

// ============================================================================
// Auth Header (for API calls)
// ============================================================================

/** Get Authorization header value for API requests. */
export function getAuthHeader(): string | null {
  const token = sessionStorage.getItem("codex_access_token");
  if (!token || token === "dev-bypass-token") return null;
  return `Bearer ${token}`;
}

/** Get auth headers object for fetch calls. */
export function getAuthHeaders(): Record<string, string> {
  const header = getAuthHeader();
  return header ? { Authorization: header } : {};
}

// ============================================================================
// Per-User Settings Key
// ============================================================================

/** Get a localStorage key scoped to the current user. */
export function getUserSettingsKey(key: string): string {
  const profile = userProfile();
  const userId = profile?.sub ?? "anonymous";
  return `codex-user-${userId}-${key}`;
}

// ============================================================================
// Exports (Reactive Signals)
// ============================================================================

export {
  userProfile,
  authStatus,
  sessionExpiresAt,
  lastActivity,
};
