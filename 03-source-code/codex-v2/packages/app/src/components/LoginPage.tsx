// ============================================================================
// CodeEX v2 — Login Page
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Single-page login gate with Kloak (Keycloak) OIDC integration.
// Design: Apple/Fortune 500 aesthetic in parity with Hybrida login page.
// Supports light/dark mode with transparent-background logo.
// ============================================================================

import { createSignal, Show, onMount } from "solid-js";
import { theme, toggleTheme } from "~/lib/theme";

interface LoginPageProps {
  onLogin: () => void;
}

// Kloak OIDC configuration
const KLOAK_REALM = "terratech";
const KLOAK_CLIENT_ID = "codex";
const KLOAK_BASE_URL = "https://kloak.terratech.systems";
const KLOAK_ISSUER = `${KLOAK_BASE_URL}/realms/${KLOAK_REALM}`;
const KLOAK_AUTH_URL = `${KLOAK_ISSUER}/protocol/openid-connect/auth`;
const KLOAK_TOKEN_URL = `${KLOAK_ISSUER}/protocol/openid-connect/token`;

/** Generate a cryptographically random state parameter for OIDC. */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate PKCE code verifier + challenge (S256). */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return { verifier, challenge };
}

export function LoginPage(props: LoginPageProps) {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [ssoLoading, setSsoLoading] = createSignal(false);
  const [ssoError, setSsoError] = createSignal("");

  onMount(() => {
    // Handle OIDC callback on page load
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oidcError = params.get("error");

    if (oidcError) {
      const desc = params.get("error_description") ?? "Single sign-on failed. Please try again.";
      setSsoError(desc);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      handleOIDCCallback(code, state);
    }
  });

  const handleOIDCCallback = async (code: string, state: string) => {
    const savedState = sessionStorage.getItem("codex_oidc_state");
    const savedVerifier = sessionStorage.getItem("codex_oidc_verifier");

    if (state !== savedState) {
      setSsoError("Security validation failed (state mismatch). Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    setSsoLoading(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KLOAK_CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        ...(savedVerifier ? { code_verifier: savedVerifier } : {}),
      });

      const res = await fetch(KLOAK_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!res.ok) {
        throw new Error(`Token exchange failed: HTTP ${res.status}`);
      }

      const tokens = await res.json();
      // Store tokens for session
      sessionStorage.setItem("codex_access_token", tokens.access_token);
      if (tokens.refresh_token) {
        sessionStorage.setItem("codex_refresh_token", tokens.refresh_token);
      }
      // Clean up OIDC state
      sessionStorage.removeItem("codex_oidc_state");
      sessionStorage.removeItem("codex_oidc_verifier");
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Login success
      props.onLogin();
    } catch (err: any) {
      setSsoError(err.message ?? "Token exchange failed. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } finally {
      setSsoLoading(false);
    }
  };

  const startSSOLogin = async () => {
    setSsoError("");
    setError("");
    setSsoLoading(true);

    try {
      const state = generateState();
      const pkce = await generatePKCE();
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      // Save state + verifier for callback validation
      sessionStorage.setItem("codex_oidc_state", state);
      sessionStorage.setItem("codex_oidc_verifier", pkce.verifier);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: KLOAK_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "openid profile email",
        state,
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      });

      window.location.href = `${KLOAK_AUTH_URL}?${params.toString()}`;
    } catch (err: any) {
      setSsoError("Failed to initiate sign-in. Please try again.");
      setSsoLoading(false);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSsoError("");

    // Read from DOM to handle password manager autofill
    const form = e.currentTarget as HTMLFormElement;
    const usernameInput = form.querySelector("#cx-username") as HTMLInputElement;
    const passwordInput = form.querySelector("#cx-password") as HTMLInputElement;
    const usernameValue = usernameInput?.value || username();
    const passwordValue = passwordInput?.value || password();

    if (!usernameValue || !passwordValue) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    try {
      // Attempt Resource Owner Password Grant against Kloak
      const body = new URLSearchParams({
        grant_type: "password",
        client_id: KLOAK_CLIENT_ID,
        username: usernameValue,
        password: passwordValue,
        scope: "openid profile email",
      });

      const res = await fetch(KLOAK_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (res.ok) {
        const tokens = await res.json();
        sessionStorage.setItem("codex_access_token", tokens.access_token);
        if (tokens.refresh_token) {
          sessionStorage.setItem("codex_refresh_token", tokens.refresh_token);
        }
        props.onLogin();
      } else if (res.status === 401) {
        setError("Invalid username or password");
        setUsername("");
        setPassword("");
      } else if (res.status === 403) {
        setError("Account locked. Please try again later or contact an administrator.");
      } else if (res.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } catch {
      // TEMPORARY BYPASS — Kloak realm not yet configured
      // Remove once Kloak SSO realm "terratech" is active
      sessionStorage.setItem("codex_access_token", "dev-bypass-token");
      props.onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="login-page">
      <div class="login-container">
        {/* Theme Toggle */}
        <button
          class="login-theme-toggle"
          onClick={toggleTheme}
          title={theme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Show when={theme() === "dark"} fallback={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          }>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </Show>
        </button>

        {/* Logo + Branding */}
        <div class="login-brand">
          <div class="login-logo">
            <svg width="64" height="64" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="fill-rule:evenodd;clip-rule:evenodd;">
              <g transform="matrix(0.0135782,0,0,0.0142209,-11.4838,-10.4996)">
                <g transform="matrix(9.92917,0,0,9.48044,-3869.65,-1319.23)">
                  <path d="M595.147,227.974C595.593,227.968 596.04,227.965 596.488,227.965C608.779,227.965 621.122,230.158 633.175,234.465L638.344,236.32L639.191,242.031C640.065,247.913 640.188,250.653 641.153,256.455C643.676,271.752 645.545,287.565 647.169,303.636L647.53,310.314C649.875,314.126 651.347,318.019 651.982,322.057L647.052,323.751C647.905,325.256 648.692,326.869 649.408,328.632C650.809,331.988 651.672,335.564 652.028,339.209L654.094,342.107C657.166,343.811 659.39,346.172 660.867,347.726L660.959,347.828C667.051,354.457 670.818,361.684 672.164,369.319C674.337,379.857 670.321,391.307 662.99,399.48C661.008,401.689 660.581,402.158 659.023,403.455C653.985,407.648 625.449,420.18 625.449,420.18C624.674,434.459 630.16,436.156 624.94,436.4C608.87,437.151 593.035,446.967 593.035,446.967C593.035,446.967 580.162,439.662 560.179,434.845C556.909,434.056 561.394,423.402 557.999,420.18C551.024,413.562 540.242,410.897 533.52,406.018C523.362,398.644 519.746,392.906 518.981,391.262C511.296,381.918 513.757,363.275 522.916,351.602L523.018,351.462L523.129,351.333C523.434,350.973 523.749,350.592 524.048,350.21C525.648,348.22 527.729,345.623 530.872,343.758C531.532,343.086 532.177,342.548 532.695,342.096L533.228,341.644L534.609,340.413L534.614,340.155L534.685,339.682C535.589,332.891 537.427,327.219 540.189,322.708L535.015,321.379L535.091,321.057L535.182,320.745C536.97,314.825 539.534,309.744 542.839,305.647L542.915,305.556C543.311,305.077 543.717,304.647 544.113,304.233L544.154,303.625C545.042,287.296 547.718,271.203 550.302,255.654C551.221,250.127 553.048,247.644 553.9,242.031L554.749,236.331L560.481,234.288C562.339,233.626 564.268,232.944 566.091,232.255L568.297,231.42C566.691,233.546 565.451,236.171 564.515,239.356C562.92,244.77 562.232,251.795 561.988,260.743C560.808,261.405 560.011,262.669 560.011,264.112C560.011,265.556 560.766,266.742 561.885,267.418L561.876,269.359C557.175,270.784 557.746,278.111 558.839,281.985C559.398,283.963 560.011,285.953 561.052,287.721C562.094,289.493 563.625,291.052 565.554,291.759C565.454,291.11 565.422,290.448 565.454,289.795C565.499,288.856 565.679,287.924 565.997,287.043C566.676,285.152 567.926,283.516 568.73,281.673C570.338,278.002 570.135,271.353 565.997,269.568L566.007,267.331C567.046,266.639 567.734,265.46 567.734,264.116C567.734,262.772 567.09,261.675 566.11,260.974C566.685,239.423 569.733,231.135 580.131,228.8L580.613,229.398L580.919,229.369L583.259,229.164L595.091,228.112L595.147,227.974ZM586.528,224.513L586.699,224.449L586.666,224.521C586.62,224.518 586.574,224.516 586.528,224.513Z" fill="currentColor"/>
                </g>
                <g transform="matrix(0.0695391,0,0,0.0676731,1676.68,1142.76)">
                  <path d="M766.4,536.9C766.3,537 766.3,537.1 766.2,537.1C781.7,561 787.9,595.2 787.9,628.4C787.9,662 782,695 766.3,718.7L766.4,718.8C777.5,732.5 792.7,742.4 809.8,746.9C832.5,716.1 841,673.4 841,630C841,585.4 831.3,539.4 806.9,508.1C791.4,511.2 780.2,519.6 766.4,536.9ZM746.8,466.7C728.9,460.9 710.2,458 691.3,458.1C654.2,458.1 616.3,473.9 589.5,498.1C579,507.6 570,518.4 562.5,530.4L602,557.1C606.4,550.4 611.3,544 616.3,537.7C632.6,517.3 653.3,496.6 697.1,496.6C701,496.6 704.8,496.8 708.6,497.2C709.1,496.7 709.5,496.1 710,495.6C720.5,483.8 733,474.1 746.8,466.7ZM710.1,763.4C708.6,761.8 707.2,760.1 705.8,758.4C699.3,759.7 692.7,760.3 686.1,760.3C658.7,760.3 620.8,737.8 601.9,716.2C599.7,713.7 597.6,711 595.7,708.2L564.5,741.3C565.5,742.3 566.4,743.4 567.5,744.4C595.4,772.7 651,802 691.3,802C710.4,802.1 729.4,798.8 747.4,792.4C733.5,784.8 720.9,775 710.1,763.4Z" fill="currentColor"/>
                  <path d="M919.1,717.8C900.3,739.4 862.5,761.9 835.1,761.9C806.5,761.9 779,750.3 760.1,726.9C740.7,703 733.7,666.8 733.7,629.9C733.7,593.5 741.2,555.8 760.1,531.9C779,508 795.3,497.9 824.2,497.9C867.9,497.9 888.6,518.6 904.8,539C909.8,545.3 914.7,551.7 919.1,558.4L958.5,531.7C951.1,519.7 942,508.9 931.6,499.4C904.8,475.1 867,459.4 830,459.4C787.5,459.4 747.6,472.6 719.7,503.7C691.8,534.8 680.9,583.9 680.9,631.4C680.9,679.5 691.3,726.6 719.7,757.8C747.5,788.3 788,803.4 830,803.4C870.2,803.4 925.7,774 953.4,745.9C954.4,744.9 955.4,743.8 956.4,742.8L925.3,709.6C923.4,712.5 921.3,715.2 919.1,717.8Z" fill="currentColor"/>
                  <path d="M754.8,279.8C551.3,279.8 386.3,383.5 386.3,622.2C386.3,859.2 551.3,964.6 754.8,964.6C958.3,964.6 1123.3,861.2 1123.3,622.2C1123.3,388.7 958.3,279.8 754.8,279.8ZM754.4,912.8C562.6,912.8 473.8,802.7 473.8,622.2C473.8,440.4 563.7,330.4 754.4,330.4C940.1,330.4 1035,444.4 1035,622.2C1035,804.3 952.7,912.8 754.4,912.8Z" fill="currentColor"/>
                </g>
                <g transform="matrix(113.335,0,0,84.4184,1564.87,872.462)">
                  <path d="M4.058,9.759L4.713,6.753L6.113,6.753L4.88,11.739L4.869,11.739L6.113,16.724L4.669,16.724L4.046,13.719L3.391,16.724L1.991,16.724L3.224,11.739L3.235,11.739L1.991,6.753L3.435,6.753L4.058,9.759Z" fill="currentColor" style="fill-rule:nonzero;"/>
                </g>
              </g>
            </svg>
          </div>
          <h1 class="login-title">CodeEX</h1>
          <p class="login-subtitle">Ageixtic IDE by TerraTech Systems</p>
        </div>

        {/* SSO Login */}
        <div class="login-card">
          <button
            class="login-sso-btn"
            onClick={startSSOLogin}
            disabled={ssoLoading()}
          >
            <Show when={!ssoLoading()} fallback={
              <span class="login-sso-inner">
                <span class="login-spinner" />
                Redirecting...
              </span>
            }>
              <span class="login-sso-inner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Continue with Kloak SSO
              </span>
            </Show>
          </button>

          <Show when={ssoError()}>
            <div class="login-error">{ssoError()}</div>
          </Show>

          {/* Divider */}
          <div class="login-divider">
            <span class="login-divider-line" />
            <span class="login-divider-text">or</span>
            <span class="login-divider-line" />
          </div>

          <p class="login-local-hint">Sign in with your credentials</p>

          {/* Local Login Form */}
          <form class="login-form" onSubmit={handleSubmit}>
            <div class="login-field">
              <label for="cx-username" class="login-label">Username</label>
              <div class="login-input-wrap">
                <svg class="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  id="cx-username"
                  type="text"
                  autocomplete="username"
                  required
                  placeholder="Username"
                  class="login-input"
                  value={username()}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                />
              </div>
            </div>

            <div class="login-field">
              <label for="cx-password" class="login-label">Password</label>
              <div class="login-input-wrap">
                <svg class="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  id="cx-password"
                  type="password"
                  autocomplete="current-password"
                  required
                  placeholder="Password"
                  class="login-input"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                />
              </div>
            </div>

            <Show when={error()}>
              <div class="login-error">{error()}</div>
            </Show>

            <button
              type="submit"
              class="login-submit-btn"
              disabled={loading()}
            >
              <Show when={loading()} fallback="Sign In">
                <span class="login-spinner" />
                Signing in...
              </Show>
            </button>
          </form>
        </div>

        {/* Footer */}
        <div class="login-footer">
          <span>TerraTech Systems</span>
          <span class="login-footer-dot">|</span>
          <span>CodeEX v2</span>
          <span class="login-footer-dot">|</span>
          <span>Powered by TerraForge</span>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          padding: var(--space-6);
          position: relative;
        }
        .login-container {
          max-width: 420px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        /* Theme Toggle */
        .login-theme-toggle {
          position: absolute;
          top: var(--space-4);
          right: var(--space-4);
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: 50%;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .login-theme-toggle:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--border-default);
        }

        /* Branding */
        .login-brand {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }
        .login-logo {
          width: 64px;
          height: 64px;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }
        .login-title {
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.02em;
        }
        .login-subtitle {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-weight: 400;
        }

        /* Card */
        .login-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        /* SSO Button */
        .login-sso-btn {
          width: 100%;
          padding: 12px var(--space-4);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          background: transparent;
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-md);
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .login-sso-btn:hover:not(:disabled) {
          background: var(--bg-hover);
          border-color: var(--border-strong);
        }
        .login-sso-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .login-sso-inner {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
        }

        /* Divider */
        .login-divider {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .login-divider-line {
          flex: 1;
          height: 1px;
          background: var(--border-subtle);
        }
        .login-divider-text {
          font-size: var(--text-xs);
          color: var(--text-disabled);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .login-local-hint {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          text-align: center;
        }

        /* Form */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .login-label {
          font-size: var(--text-xs);
          font-weight: 500;
          color: var(--text-secondary);
          display: none;
        }
        .login-input-wrap {
          position: relative;
        }
        .login-input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-disabled);
          pointer-events: none;
        }
        .login-input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          color: var(--text-primary);
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          transition: all var(--duration-fast) var(--ease-out);
          outline: none;
        }
        .login-input::placeholder {
          color: var(--text-disabled);
        }
        .login-input:focus {
          border-color: var(--accent-blue);
          box-shadow: 0 0 0 3px rgba(41, 151, 255, 0.15);
        }

        /* Error */
        .login-error {
          padding: var(--space-3);
          background: rgba(255, 59, 48, 0.08);
          border: 1px solid rgba(255, 59, 48, 0.2);
          border-radius: var(--radius-md);
          color: var(--accent-red);
          font-size: var(--text-xs);
        }

        /* Submit */
        .login-submit-btn {
          width: 100%;
          padding: 12px var(--space-4);
          background: var(--text-primary);
          color: var(--text-inverse);
          border: none;
          border-radius: var(--radius-lg);
          font-family: var(--font-ui);
          font-size: var(--text-md);
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
        }
        .login-submit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Spinner */
        .login-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: login-spin 0.6s linear infinite;
        }
        @keyframes login-spin {
          to { transform: rotate(360deg); }
        }

        /* Footer */
        .login-footer {
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-disabled);
          font-family: var(--font-mono);
        }
        .login-footer-dot {
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}
