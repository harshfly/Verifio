/* ═══════════════════════════════════════════════
   Verifio — Landing Page JavaScript
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
     1) COUNT-UP ANIMATION (Stats)
     ─────────────────────────────────────────── */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function countUp(el, target, decimals, suffix, duration) {
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = target * easeOutCubic(progress);
      el.textContent = value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // IntersectionObserver to trigger count-up once
  const statValues = document.querySelectorAll(".stat-value");
  let statsCounted = false;

  const statsObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !statsCounted) {
          statsCounted = true;
          statValues.forEach(function (el, i) {
            const target = parseFloat(el.dataset.target);
            const suffix = el.dataset.suffix || "";
            const decimals = parseInt(el.dataset.decimals, 10) || 0;
            const duration = 1500 + i * 80;
            const offset = 480 + i * 90;
            setTimeout(function () {
              countUp(el, target, decimals, suffix, duration);
            }, offset);
          });
          statsObserver.disconnect();
        }
      });
    },
    { threshold: 0.25 }
  );

  const statsFooter = document.querySelector(".stats");
  if (statsFooter) statsObserver.observe(statsFooter);

  /* ───────────────────────────────────────────
     2) MOBILE MENU
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

  // Close on overlay click
  if (menuOverlay) {
    menuOverlay.addEventListener("click", closeMenu);
  }

  // Close on link click
  menuLinks.forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !mobileMenu.hidden) {
      closeMenu();
    }
  });

  // Close on resize > 720
  window.addEventListener("resize", function () {
    if (window.innerWidth > 720 && !mobileMenu.hidden) {
      closeMenu();
    }
  });

  /* ───────────────────────────────────────────
     3) CHATBOX — File Upload, Real-Time Analysis, & Report Modal
     ─────────────────────────────────────────── */
  var chatInput = document.getElementById("chatbox-input");
  var chatboxAdd = document.getElementById("chatbox-add");
  var chatboxSend = document.getElementById("chatbox-send");
  var chatboxFileInput = document.getElementById("chatbox-file-input");
  var chatboxFilesContainer = document.getElementById("chatbox-files");
  var chatboxStatus = document.getElementById("chatbox-status");
  var chatboxStatusText = document.getElementById("chatbox-status-text");

  var reportModal = document.getElementById("report-modal");
  var reportClose = document.getElementById("report-close");
  var reportBody = document.getElementById("report-body");
  var reportDocTitle = document.getElementById("report-doc-title");

  var selectedFiles = [];

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    var k = 1024;
    var sizes = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function getFileIcon(name) {
    var lower = name.toLowerCase();
    if (lower.endsWith(".pdf")) return "fa-regular fa-file-pdf";
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "fa-regular fa-file-word";
    return "fa-regular fa-file-lines";
  }

  function renderFileChips() {
    if (!chatboxFilesContainer) return;
    chatboxFilesContainer.innerHTML = "";
    if (selectedFiles.length === 0) {
      chatboxFilesContainer.style.display = "none";
      if (chatboxSend) chatboxSend.classList.remove("has-file");
      return;
    }
    chatboxFilesContainer.style.display = "flex";
    if (chatboxSend) chatboxSend.classList.add("has-file");
    selectedFiles.forEach(function (file, index) {
      var chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = '<i class="' + getFileIcon(file.name) + '"></i>' +
        '<span>' + file.name + ' <small style="opacity:0.65">(' + formatBytes(file.size) + ')</small></span>' +
        '<button type="button" class="file-chip-remove" title="Remove file" data-index="' + index + '">&times;</button>';
      chatboxFilesContainer.appendChild(chip);
    });

    chatboxFilesContainer.querySelectorAll(".file-chip-remove").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var idx = parseInt(this.dataset.index, 10);
        selectedFiles.splice(idx, 1);
        renderFileChips();
      });
    });
  }

  if (chatboxFileInput) {
    // Native label opens file dialog automatically; handle keyboard triggers for accessibility
    if (chatboxAdd) {
      chatboxAdd.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          chatboxFileInput.click();
        }
      });
    }

    chatboxFileInput.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        Array.from(this.files).forEach(function (f) {
          if (!selectedFiles.some(function (item) { return item.name === f.name && item.size === f.size; })) {
            selectedFiles.push(f);
          }
        });
        renderFileChips();
        this.value = "";
      }
    });

    // Global Drag & Drop over entire window
    var dropOverlay = document.getElementById("drop-overlay");
    var dragCounter = 0;

    ["dragenter", "dragover", "dragleave", "drop"].forEach(function (eventName) {
      window.addEventListener(eventName, function (e) {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    window.addEventListener("dragenter", function (e) {
      dragCounter++;
      if (dropOverlay) {
        dropOverlay.style.display = "flex";
        dropOverlay.classList.add("active");
      }
    }, false);

    window.addEventListener("dragleave", function (e) {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (dropOverlay) {
          dropOverlay.classList.remove("active");
          dropOverlay.style.display = "none";
        }
      }
    }, false);

    window.addEventListener("drop", function (e) {
      dragCounter = 0;
      if (dropOverlay) {
        dropOverlay.classList.remove("active");
        dropOverlay.style.display = "none";
      }
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        Array.from(dt.files).forEach(function (f) {
          if (!selectedFiles.some(function (item) { return item.name === f.name && item.size === f.size; })) {
            selectedFiles.push(f);
          }
        });
        renderFileChips();
      }
    }, false);

    // Paste files directly into chatbox (Ctrl+V)
    if (chatInput) {
      chatInput.addEventListener("paste", function (e) {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          Array.from(e.clipboardData.files).forEach(function (f) {
            selectedFiles.push(f);
          });
          renderFileChips();
        }
      });
    }
  }

  // Ensure authenticated token (validates existing token, or auto-logins / auto-provisions demo user)
  async function getAuthToken() {
    var token = localStorage.getItem("verifio_token");
    if (token) {
      try {
        var meRes = await fetch("http://localhost:8000/api/v1/auth/me", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (meRes.ok) return token;
      } catch (e) {
        console.warn("Token check error, continuing...", e);
      }
      // If token is invalid, stale, or rejected, clear it
      localStorage.removeItem("verifio_token");
    }

    try {
      // Auto-login to default test account
      var formData = new URLSearchParams();
      formData.append("username", "harsh@example.com");
      formData.append("password", "securepassword123");

      var res = await fetch("http://localhost:8000/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
      });

      if (res.ok) {
        var data = await res.json();
        localStorage.setItem("verifio_token", data.access_token);
        return data.access_token;
      } else if (res.status === 401 || res.status === 404) {
        // Auto-provision demo account if DB is fresh
        var regRes = await fetch("http://localhost:8000/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "harsh@example.com",
            password: "securepassword123",
            name: "Harsh Malviya",
            role: "evaluator"
          })
        });
        if (regRes.ok) {
          var retryLogin = await fetch("http://localhost:8000/api/v1/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
          });
          if (retryLogin.ok) {
            var retryData = await retryLogin.json();
            localStorage.setItem("verifio_token", retryData.access_token);
            return retryData.access_token;
          }
        }
      }
    } catch (e) {
      console.warn("Auto-login / provision failed:", e);
    }
    return null;
  }

  // Handle Document Submission & Real-time Analysis
  async function submitDocument() {
    var textContent = chatInput ? chatInput.value.trim() : "";
    if (selectedFiles.length === 0 && !textContent) {
      if (chatInput) chatInput.focus();
      return;
    }

    var token = await getAuthToken();
    if (!token) {
      alert("Please sign in first to analyze documents.");
      window.location.href = "signin.html";
      return;
    }

    var fileToUpload = selectedFiles[0];
    if (!fileToUpload && textContent) {
      // Create text file blob if user pasted raw text
      fileToUpload = new File([textContent], "submitted_text.txt", { type: "text/plain" });
    }

    // Set UI loading state
    if (chatboxStatus) {
      chatboxStatus.style.display = "flex";
      chatboxStatusText.textContent = "Uploading " + fileToUpload.name + "...";
    }
    if (chatboxSend) {
      chatboxSend.disabled = true;
      chatboxSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
      var uploadData = new FormData();
      uploadData.append("file", fileToUpload);
      uploadData.append("title", fileToUpload.name.replace(/\.[^/.]+$/, ""));

      var uploadRes = await fetch("http://localhost:8000/api/v1/submissions/", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token },
        body: uploadData
      });

      // Handle stale/expired token automatically
      if (uploadRes.status === 401) {
        localStorage.removeItem("verifio_token");
        token = await getAuthToken();
        if (token) {
          uploadRes = await fetch("http://localhost:8000/api/v1/submissions/", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token },
            body: uploadData
          });
        }
      }

      if (!uploadRes.ok) {
        var errJson = await uploadRes.json().catch(function () { return {}; });
        throw new Error(errJson.detail || "Upload failed (status " + uploadRes.status + ")");
      }

      var submission = await uploadRes.json();
      var subId = submission.id;

      if (chatboxStatusText) chatboxStatusText.textContent = "Analyzing authenticity...";

      // Poll submission status until completed/clean/flagged/review
      var attempts = 0;
      var pollInterval = setInterval(async function () {
        attempts++;
        try {
          var stRes = await fetch("http://localhost:8000/api/v1/submissions/" + subId + "/status", {
            headers: { "Authorization": "Bearer " + token }
          });

          if (stRes.ok) {
            var stData = await stRes.json();
            var status = stData.status;

            if (status === "clean" || status === "review" || status === "flagged" || status === "completed") {
              clearInterval(pollInterval);
              // Fetch report
              var repRes = await fetch("http://localhost:8000/api/v1/reports/" + subId, {
                headers: { "Authorization": "Bearer " + token }
              });

              if (repRes.ok) {
                var repData = await repRes.json();
                displayReport(repData, fileToUpload.name);
              }
              resetUploadUI();
            } else if (status === "failed") {
              clearInterval(pollInterval);
              alert("Analysis encountered an error during processing.");
              resetUploadUI();
            }
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }

        if (attempts > 30) {
          clearInterval(pollInterval);
          alert("Analysis is taking longer than expected. Please check back shortly.");
          resetUploadUI();
        }
      }, 1500);

    } catch (err) {
      console.error("Upload error:", err);
      alert("Error: " + err.message);
      resetUploadUI();
    }
  }

  function resetUploadUI() {
    if (chatboxStatus) chatboxStatus.style.display = "none";
    if (chatboxSend) {
      chatboxSend.disabled = false;
      chatboxSend.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
    }
    selectedFiles = [];
    renderFileChips();
    if (chatInput) chatInput.value = "";
  }

  // Display Beautiful Authenticity Report Modal
  function displayReport(data, fileName) {
    if (!reportBody || !reportModal) return;

    var rep = data.report || {};
    var modules = data.module_details || [];
    var riskScore = Math.round(rep.authenticity_score !== undefined ? rep.authenticity_score : 0);
    var originalityScore = Math.max(0, 100 - riskScore);
    var status = (rep.status || "clean").toLowerCase();

    if (reportDocTitle) {
      reportDocTitle.textContent = fileName + " • " + new Date().toLocaleTimeString();
    }

    var badgeClass = "badge-clean";
    var badgeText = "Clean & Authentic";
    var strokeColor = "#22c55e";
    var scoreDesc = "Verified Authentic Work. Overall risk index is " + riskScore + "% across Plagiarism, Semantic Similarity, AI Synthesizer, and Document Forensics.";

    if (status === "review" || (riskScore >= 25 && riskScore < 60)) {
      badgeClass = "badge-review";
      badgeText = "Review Recommended (" + riskScore + "% Risk)";
      strokeColor = "#f59e0b";
      scoreDesc = "Moderate elevated indicators detected. Originality estimated at " + originalityScore + "%. Institutional review recommended.";
    } else if (status === "flagged" || riskScore >= 60) {
      badgeClass = "badge-flagged";
      badgeText = "Flagged Anomalies (" + riskScore + "% Risk)";
      strokeColor = "#ef4444";
      scoreDesc = "High probability of AI-generated content or substantial similarity overlap detected (" + riskScore + "% Risk Index).";
    }

    var strokeDashoffset = 251.2 - (251.2 * originalityScore) / 100;

    var modulesHtml = modules.map(function (m) {
      var mScore = Math.round(m.risk_score || 0);
      var mFill = mScore < 25 ? "fill-clean" : (mScore < 60 ? "fill-review" : "fill-flagged");
      var nameLabels = {
        "plagiarism": "Verbatim Plagiarism Risk",
        "similarity": "Semantic Similarity Overlap",
        "ai_detection": "AI Generation Probability",
        "manipulation": "Document Manipulation Risk"
      };
      return '<div class="module-card">' +
        '<div class="module-head">' +
          '<span class="module-name">' + (nameLabels[m.module_name] || m.module_name) + '</span>' +
          '<span class="module-score">' + mScore + '%</span>' +
        '</div>' +
        '<div class="module-bar-track">' +
          '<div class="module-bar-fill ' + mFill + '" style="width: ' + mScore + '%;"></div>' +
        '</div>' +
      '</div>';
    }).join("");

    // Extract AI Synthesis details
    var aiModule = modules.find(function (m) { return m.module_name === "ai_detection"; });
    var aiDetails = aiModule ? (aiModule.details || {}) : {};
    var aiSummary = aiDetails.summary || "";
    var keyIndicators = aiDetails.key_indicators || [];

    var synthesisHtml = "";
    if (aiSummary) {
      synthesisHtml = '<div class="evidence-section" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;">' +
        '<div class="evidence-title" style="color: #34d399; display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-weight: 600;">' +
          '<i class="fa-solid fa-microchip"></i> AI Authorship &amp; Originality Synthesis' +
        '</div>' +
        '<p style="font-size: 13px; line-height: 1.5; color: #e2e8f0; margin: 0 0 8px 0;">' + aiSummary + '</p>' +
        (keyIndicators.length > 0 ? (
          '<div style="display: flex; flex-wrap: wrap; gap: 6px;">' +
          keyIndicators.map(function (k) {
            return '<span style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 3px 8px; border-radius: 6px; font-size: 11px; color: #cbd5e1;"><i class="fa-solid fa-check" style="color: #34d399; margin-right: 4px;"></i>' + k + '</span>';
          }).join('') +
          '</div>'
        ) : '') +
      '</div>';
    }

    var flaggedSegments = (rep.flagged_segments || []).filter(function (f) {
      return f.matched_source_ref !== "AI Authorship & Originality Audit";
    });

    var evidenceHtml = "";
    if (flaggedSegments.length > 0) {
      evidenceHtml = '<div class="evidence-section">' +
        '<div class="evidence-title">Flagged Segments &amp; Anomalies (' + flaggedSegments.length + ')</div>' +
        '<div class="evidence-list">' +
        flaggedSegments.map(function (f) {
          var sevClass = "sev-" + (f.severity || "medium");
          return '<div class="evidence-item ' + sevClass + '">' +
            '<span class="evidence-tag">' + (f.module || "signal") + '</span>' +
            '<div>' + (f.segment_text || "Anomaly detected") + '</div>' +
          '</div>';
        }).join("") +
        '</div>' +
      '</div>';
    } else if (!aiSummary) {
      evidenceHtml = '<div class="evidence-section">' +
        '<div class="evidence-title">Integrity Verification</div>' +
        '<div style="font-size: 13px; color: #4ade80; padding: 8px 0;"><i class="fa-solid fa-circle-check"></i> Verified authentic work across all detection modules. Zero plagiarism or manipulation anomalies detected.</div>' +
      '</div>';
    }

    reportBody.innerHTML =
      '<div class="score-hero">' +
        '<div class="score-gauge-wrap">' +
          '<svg class="score-circle-svg" viewBox="0 0 100 100">' +
            '<circle class="score-circle-bg" cx="50" cy="50" r="40"></circle>' +
            '<circle class="score-circle-bar" cx="50" cy="50" r="40" stroke="' + strokeColor + '" stroke-dasharray="251.2" stroke-dashoffset="' + strokeDashoffset + '"></circle>' +
          '</svg>' +
          '<div style="position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">' +
            '<span class="score-number" style="line-height: 1;">' + originalityScore + '%</span>' +
            '<span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-top: 2px;">Originality</span>' +
          '</div>' +
        '</div>' +
        '<div class="score-meta">' +
          '<span class="score-badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<p class="score-desc">' + scoreDesc + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="module-grid">' + modulesHtml + '</div>' +
      synthesisHtml +
      evidenceHtml +
      '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);">' +
        '<a href="report.html?id=' + (rep.submission_id || "") + '" style="background: #fff; color: #07090e; font-weight: 600; padding: 9px 18px; border-radius: 8px; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: opacity 0.2s;">' +
          '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Full Report &amp; Text Viewer' +
        '</a>' +
      '</div>';

    reportModal.style.display = "flex";
    reportModal.classList.add("active");
    reportModal.setAttribute("aria-hidden", "false");
  }

  if (chatboxSend) {
    chatboxSend.addEventListener("click", function (e) {
      e.preventDefault();
      submitDocument();
    });
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitDocument();
      }
    });

    chatInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    var placeholders = [
      "How authentic is this research paper?",
      "Check if this essay contains AI-generated text\u2026",
      "Scan my thesis for plagiarism\u2026",
      "Detect hidden manipulation in this PDF\u2026",
      "Is this submission original work?"
    ];
    var phIndex = 0;
    var phInterval = setInterval(function () {
      phIndex = (phIndex + 1) % placeholders.length;
      chatInput.setAttribute("placeholder", placeholders[phIndex]);
    }, 3500);

    chatInput.addEventListener("focus", function () {
      clearInterval(phInterval);
    });
  }

  // Close Report Modal
  function closeReportModal() {
    if (!reportModal) return;
    reportModal.classList.remove("active");
    reportModal.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      if (!reportModal.classList.contains("active")) {
        reportModal.style.display = "none";
      }
    }, 200);
  }

  if (reportClose && reportModal) {
    reportClose.addEventListener("click", closeReportModal);

    reportModal.addEventListener("click", function (e) {
      if (e.target === reportModal) {
        closeReportModal();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && reportModal.classList.contains("active")) {
        closeReportModal();
      }
    });
  }
})();
