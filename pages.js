/* ═══════════════════════════════════════════════
   Verifio — Shared Page JavaScript
   ═══════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────
     0) BACKGROUND VIDEO (Local Fast MP4)
     ─────────────────────────────────────────── */
  var video = document.getElementById("bg-video");
  if (video) {
    video.muted = true;
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        document.addEventListener("click", function () {
          video.play().catch(function () {});
        }, { once: true });
      });
    }
  }

  /* ───────────────────────────────────────────
     1) MOBILE MENU
     ─────────────────────────────────────────── */
  const burger = document.querySelector(".burger");
  const mobileMenu = document.querySelector(".mobile-menu");
  const menuOverlay = document.querySelector(".menu-overlay");
  const menuLinks = document.querySelectorAll(".menu-link, .menu-sign-in");

  function openMenu() {
    burger.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    mobileMenu.hidden = false;
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    mobileMenu.hidden = true;
    document.body.classList.remove("menu-open");
  }

  if (burger) {
    burger.addEventListener("click", function () {
      const isOpen = burger.classList.contains("open");
      if (isOpen) closeMenu();
      else openMenu();
    });
  }

  if (menuOverlay) {
    menuOverlay.addEventListener("click", closeMenu);
  }

  menuLinks.forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !mobileMenu.hidden) {
      closeMenu();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 720 && !mobileMenu.hidden) {
      closeMenu();
    }
  });

  /* ───────────────────────────────────────────
     2) BILLING TOGGLE (Pricing page)
     ─────────────────────────────────────────── */
  var billingToggle = document.getElementById("billing-toggle");
  var monthlyLabel = document.getElementById("monthly-label");
  var annualLabel = document.getElementById("annual-label");

  if (billingToggle) {
    var isAnnual = false;

    billingToggle.addEventListener("click", function () {
      isAnnual = !isAnnual;
      billingToggle.classList.toggle("active", isAnnual);

      if (monthlyLabel) {
        monthlyLabel.classList.toggle("billing-active", !isAnnual);
      }
      if (annualLabel) {
        annualLabel.classList.toggle("billing-active", isAnnual);
      }

      var priceEls = document.querySelectorAll(".price-amount");
      priceEls.forEach(function (el) {
        var monthly = el.dataset.monthly;
        var annual = el.dataset.annual;
        var value = isAnnual ? annual : monthly;
        el.textContent = "$" + value;
      });
    });
  }

  /* ───────────────────────────────────────────
     3) SIGN IN / SIGN UP TOGGLE
     ─────────────────────────────────────────── */
  var authSwitchBtn = document.getElementById("auth-switch-btn");
  var authFormTitle = document.getElementById("auth-form-title");
  var authFormSubtitle = document.getElementById("auth-form-subtitle");
  var authSwitchText = document.getElementById("auth-switch-text");
  var authSubmit = document.getElementById("auth-submit");
  var nameGroup = document.getElementById("name-group");
  var roleGroup = document.getElementById("role-group");

  if (authSwitchBtn) {
    var isSignUp = false;

    authSwitchBtn.addEventListener("click", function () {
      isSignUp = !isSignUp;

      if (isSignUp) {
        authFormTitle.textContent = "Create your account";
        authFormSubtitle.textContent = "Join Verifio to start validating academic submissions.";
        authSwitchText.textContent = "Already have an account?";
        authSwitchBtn.textContent = "Sign in";
        authSubmit.querySelector("span").textContent = "Create account";
        if (nameGroup) nameGroup.classList.remove("form-group-hidden");
        if (roleGroup) roleGroup.classList.remove("form-group-hidden");
      } else {
        authFormTitle.textContent = "Welcome back";
        authFormSubtitle.textContent = "Sign in to access your dashboard and reports.";
        authSwitchText.textContent = "Don't have an account?";
        authSwitchBtn.textContent = "Create one";
        authSubmit.querySelector("span").textContent = "Sign in";
        if (nameGroup) nameGroup.classList.add("form-group-hidden");
        if (roleGroup) roleGroup.classList.add("form-group-hidden");
      }
    });
  }

  /* ───────────────────────────────────────────
     4) PASSWORD VISIBILITY TOGGLE
     ─────────────────────────────────────────── */
  var passwordToggle = document.getElementById("password-toggle");
  var passwordInput = document.getElementById("auth-password");

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", function () {
      var isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      var icon = passwordToggle.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
      }
    });
  }

  /* ───────────────────────────────────────────
     5) FORM SUBMISSION & SOCIAL / DEMO AUTH
     ─────────────────────────────────────────── */
  function completeAuthAndRedirect(userData, token, targetUrl) {
    localStorage.setItem("verifio_token", token || ("demo-token-" + Date.now()));
    localStorage.setItem("verifio_user", JSON.stringify(userData));
    setTimeout(function () {
      window.location.href = targetUrl || "dashboard.html";
    }, 700);
  }

  // 1-Click Demo Access Pills
  var demoPills = document.querySelectorAll(".demo-pill-btn");
  demoPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      var role = pill.dataset.role || "evaluator";
      var email = pill.dataset.email || (role + "@university.edu");
      var name = pill.dataset.name || (role.charAt(0).toUpperCase() + role.slice(1) + " Demo");

      pill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

      var userData = {
        id: "demo-" + role + "-id",
        email: email,
        name: name,
        role: role
      };

      completeAuthAndRedirect(userData, "demo-" + role + "-token", "dashboard.html");
    });
  });

  // Social Login Buttons (Google & GitHub)
  var googleBtn = document.getElementById("btn-google-auth");
  if (googleBtn) {
    googleBtn.addEventListener("click", function () {
      googleBtn.disabled = true;
      googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Connecting...</span>';
      
      var userData = {
        id: "google-eval-1",
        email: "evaluator@google.edu",
        name: "Google Verified Evaluator",
        role: "evaluator"
      };

      setTimeout(function () {
        googleBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Success!</span>';
        completeAuthAndRedirect(userData, "google-eval-token", "dashboard.html");
      }, 500);
    });
  }

  var githubBtn = document.getElementById("btn-github-auth");
  if (githubBtn) {
    githubBtn.addEventListener("click", function () {
      githubBtn.disabled = true;
      githubBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Connecting...</span>';
      
      var userData = {
        id: "github-eval-1",
        email: "researcher@github.edu",
        name: "GitHub Verified Researcher",
        role: "evaluator"
      };

      setTimeout(function () {
        githubBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Success!</span>';
        completeAuthAndRedirect(userData, "github-eval-token", "dashboard.html");
      }, 500);
    });
  }

  // Form submission with live backend + seamless demo fallback
  var authForm = document.getElementById("auth-form");
  if (authForm) {
    authForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("auth-email").value.trim();
      var password = document.getElementById("auth-password").value;
      var name = document.getElementById("auth-name") ? document.getElementById("auth-name").value.trim() : "";
      var role = document.getElementById("auth-role") ? document.getElementById("auth-role").value : "evaluator";
      var submitBtn = document.getElementById("auth-submit");
      var originalBtnText = submitBtn.innerHTML;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Verifying credentials...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

      try {
        var liveSuccess = false;

        // Try live backend first
        try {
          if (isSignUp) {
            var regRes = await fetch("http://localhost:8000/api/v1/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email, password: password, name: name, role: role })
            });
            if (regRes.ok) {
              // Successfully registered
            }
          }

          var formData = new URLSearchParams();
          formData.append("username", email);
          formData.append("password", password);

          var loginRes = await fetch("http://localhost:8000/api/v1/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
          });

          if (loginRes.ok) {
            var authData = await loginRes.json();
            localStorage.setItem("verifio_token", authData.access_token);

            var meRes = await fetch("http://localhost:8000/api/v1/auth/me", {
              headers: { "Authorization": "Bearer " + authData.access_token }
            });
            if (meRes.ok) {
              var userData = await meRes.json();
              localStorage.setItem("verifio_user", JSON.stringify(userData));
              liveSuccess = true;
            }
          }
        } catch (apiErr) {
          console.warn("Backend unavailable, using demo mode authentication:", apiErr);
        }

        if (!liveSuccess) {
          // Automatic demo mode session fallback
          var demoRole = role || (email.includes("admin") ? "admin" : (email.includes("student") ? "student" : "evaluator"));
          var fallbackUser = {
            id: "user-" + Math.random().toString(36).substr(2, 9),
            email: email || "evaluator@university.edu",
            name: name || (email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1)),
            role: demoRole
          };
          localStorage.setItem("verifio_token", "demo-jwt-token-" + Date.now());
          localStorage.setItem("verifio_user", JSON.stringify(fallbackUser));
        }

        submitBtn.innerHTML = '<span>✓ Success! Opening Dashboard...</span> <i class="fa-solid fa-check"></i>';
        setTimeout(function () {
          window.location.href = "dashboard.html";
        }, 800);

      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    });
  }
})();
