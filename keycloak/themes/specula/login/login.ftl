<#--
  Specula login page — Freemarker override of Keycloak's base login.ftl.
  Full-bleed nebula background with a dark translucent card on the
  left (form) and a marketing tagline on the right, matching the
  operator-ui /login page in the vSparQ app.

  Keycloak passes these variables into scope:
    - realm            — the current realm object (name, displayName…)
    - url              — action URLs (loginAction, registrationUrl, …)
    - login            — persisted form state (username after failed submit)
    - message          — flash message from previous request (error/success)
    - messagesPerField — per-field validation errors
    - properties       — theme.properties values

  We intentionally do NOT extend template.ftl — we render the whole
  <html> ourselves so the layout matches the operator-ui page pixel-for-
  pixel without inheriting Keycloak's default chrome (Patternfly nav,
  gradient panels, logos, etc.).
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("loginTitle",(realm.displayName!'Specula'))}</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body
  class="specula-login"
  style="background-image: url('${url.resourcesPath}/img/specula-bg.webp');"
>
  <div class="specula-bg-tint"></div>
  <main class="specula-layout">
    <div class="specula-card">
      <div class="specula-brand-row">
        <img
          class="specula-logo"
          src="${url.resourcesPath}/img/specula-logo.svg"
          alt=""
          width="40"
          height="40"
        />
        <div class="specula-brand">SPECULA <span class="specula-brand-by">by</span> <span class="specula-brand-sub">Ensoledus</span></div>
      </div>

      <h1 class="specula-title">Welcome Back, Friend</h1>
      <p class="specula-lede">
        Sign in to your Specula console &mdash; the observation deck for
        your charging constellations, orbitals, and impactors.
      </p>

      <#-- Flash error from a previous submit -->
      <#if message?has_content && message.type = 'error'>
        <div role="alert" class="specula-alert">${kcSanitize(message.summary)?no_esc}</div>
      </#if>

      <#if realm.password>
        <form id="kc-form-login"
              class="specula-form"
              action="${url.loginAction}"
              method="post"
              autocomplete="off">
          <div class="specula-field">
            <label for="username">
              <#if !realm.loginWithEmailAllowed>Username<#elseif !realm.registrationEmailAsUsername>Username or email<#else>Email</#if>
            </label>
            <input
              tabindex="1"
              id="username"
              name="username"
              type="text"
              value="${(login.username!'')}"
              autofocus
              aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
            />
          </div>

          <div class="specula-field">
            <label for="password">Password</label>
            <input
              tabindex="2"
              id="password"
              name="password"
              type="password"
              autocomplete="off"
              aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
            />
            <div class="specula-field-utility">
              <#if realm.resetPasswordAllowed>
                <a tabindex="5" href="${url.loginResetCredentialsUrl}">Forgot password?</a>
              </#if>
            </div>
          </div>

          <input type="hidden" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

          <button tabindex="4" class="specula-submit" name="login" type="submit">
            Log In
          </button>
        </form>
      </#if>

      <div class="specula-foot">
        <#if realm.registrationAllowed?? && realm.registrationAllowed>
          <span>
            Don&rsquo;t have an account?
            <a tabindex="6" href="${url.registrationUrl}">Register here</a>
          </span>
        <#else>
          <span></span>
        </#if>
        <a href="mailto:support@specula.local">Contact Support</a>
      </div>
    </div>

    <aside class="specula-marketing">
      <h2>One Source Of Truth<br/>For Every Workflow</h2>
      <p>
        Watch your constellations breathe. Track every orbital&rsquo;s
        status, every impactor&rsquo;s draw, every session&rsquo;s
        lifecycle &mdash; from the same observation deck.
      </p>
      <div class="specula-dots" aria-hidden="true">
        <span class="active"></span><span></span><span></span>
      </div>
    </aside>
  </main>

  <#-- Dev-only page-load perf badge, bottom-right. Uses the modern
       PerformanceNavigationTiming API (deprecated performance.timing
       as fallback). Also logs to console for scripted capture. -->
  <script>
    window.addEventListener('load', function () {
      var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
      var t = nav ? {
        ttfb:   Math.round(nav.responseStart),
        domRdy: Math.round(nav.domContentLoadedEventEnd),
        load:   Math.round(nav.loadEventEnd)
      } : {
        ttfb:   performance.timing.responseStart          - performance.timing.navigationStart,
        domRdy: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        load:   performance.timing.loadEventEnd            - performance.timing.navigationStart
      };
      console.log('[specula-login] TTFB=' + t.ttfb + 'ms · DOM=' + t.domRdy + 'ms · LOAD=' + t.load + 'ms');
      var b = document.createElement('div');
      b.style.cssText =
        'position:fixed;bottom:8px;right:8px;padding:6px 10px;' +
        'font:11px "SF Mono","Menlo",monospace;background:rgba(0,0,0,0.65);' +
        'color:#e5e5e5;border-radius:6px;border:1px solid rgba(255,255,255,0.1);' +
        'z-index:9999;pointer-events:none;';
      b.textContent = 'TTFB ' + t.ttfb + 'ms · DOM ' + t.domRdy + 'ms · Load ' + t.load + 'ms';
      document.body.appendChild(b);
    });
  </script>
</body>
</html>
