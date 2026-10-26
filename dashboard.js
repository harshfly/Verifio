/* ══════════════════════════════════════════════════════════════════
   Verifio — Evaluator Dashboard Controller (Phase 8)
   Orchestrates stats, charts, submissions table, and weight config
   ══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var API_BASE = "http://localhost:8000/api/v1";

  // ── DOM References ──────────────────────────────────────────────
  var loadingEl = document.getElementById("dash-loading");
  var errorEl = document.getElementById("dash-error");
  var contentEl = document.getElementById("dash-content");
  var errorTitle = document.getElementById("error-title");
  var errorDesc = document.getElementById("error-desc");

  // Stats
  var statTotalSubs = document.getElementById("stat-total-submissions");
  var statTotalReports = document.getElementById("stat-total-reports");
  var statAvgScore = document.getElementById("stat-avg-score");
  var statTotalUsers = document.getElementById("stat-total-users");

  // Charts
  var donutSvg = document.getElementById("donut-submissions");
  var donutTotal = document.getElementById("donut-total-subs");
  var legendSubs = document.getElementById("legend-submissions");

  var barClean = document.getElementById("bar-clean");
  var barReview = document.getElementById("bar-review");
  var barFlagged = document.getElementById("bar-flagged");
  var barCountClean = document.getElementById("bar-count-clean");
  var barCountReview = document.getElementById("bar-count-review");
  var barCountFlagged = document.getElementById("bar-count-flagged");

  // Table
  var tableBody = document.getElementById("submissions-tbody");
  var tableSearch = document.getElementById("table-search");
  var filterStatus = document.getElementById("filter-status");
  var filterVerdict = document.getElementById("filter-verdict");
  var resultCount = document.getElementById("table-result-count");
  var paginationEl = document.getElementById("table-pagination");

  // Admin
  var adminSection = document.getElementById("admin-section");
  var weightsForm = document.getElementById("weights-form");
  var roleBadge = document.getElementById("user-role-badge");
  var roleText = document.getElementById("user-role-text");
  var btnRefresh = document.getElementById("btn-refresh");

  // Weight sliders
  var sliders = {
    plagiarism: document.getElementById("slider-plagiarism"),
    similarity: document.getElementById("slider-similarity"),
    ai_detection: document.getElementById("slider-ai"),
    manipulation: document.getElementById("slider-manipulation"),
  };
  var displays = {
    plagiarism: document.getElementById("display-plagiarism"),
    similarity: document.getElementById("display-similarity"),
    ai_detection: document.getElementById("display-ai"),
    manipulation: document.getElementById("display-manipulation"),
  };
  var sumSegs = {
    plagiarism: document.getElementById("sum-seg-plagiarism"),
    similarity: document.getElementById("sum-seg-similarity"),
    ai_detection: document.getElementById("sum-seg-ai"),
    manipulation: document.getElementById("sum-seg-manipulation"),
  };
  var sumValue = document.getElementById("weights-sum-value");
  var sumStatus = document.getElementById("weights-sum-status");
  var btnResetWeights = document.getElementById("btn-reset-weights");
  var btnSaveWeights = document.getElementById("btn-save-weights");
  var weightsToast = document.getElementById("weights-toast");
  var weightsToastMsg = document.getElementById("weights-toast-msg");

  // ── State ──────────────────────────────────────────────────────
  var allSubmissions = [];
  var filteredSubmissions = [];
  var currentPage = 1;
  var pageSize = 15;
  var sortKey = "date";
  var sortDir = "desc";
  var userRole = null;

  // ── Auth Token ─────────────────────────────────────────────────
  function getToken() {
    try {
      return localStorage.getItem("verifio_token") || sessionStorage.getItem("verifio_token");
    } catch (e) {
      return null;
    }
  }

  function authHeaders() {
    var token = getToken();
    if (!token) return {};
    return { Authorization: "Bearer " + token };
  }

  // ── Fetch Helpers ──────────────────────────────────────────────
  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, authHeaders(), {
      "Content-Type": "application/json",
    });
    return fetch(API_BASE + url, opts)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.json();
      });
  }

  // ── Initialize ────────────────────────────────────────────────
  function init() {
    // First check if user is authenticated
    var token = getToken();
    if (!token) {
      // No token — load demo mode directly
      loadDemoMode();
      return;
    }

    // Get user info to check role
    apiFetch("/auth/me")
      .then(function (user) {
        userRole = user.role;
        roleText.textContent = capitalizeFirst(userRole);

        if (userRole === "admin") {
          roleBadge.style.background = "rgba(245, 158, 11, 0.12)";
          roleBadge.style.color = "#f59e0b";
          roleBadge.style.borderColor = "rgba(245, 158, 11, 0.25)";
          adminSection.style.display = "block";
          loadWeightConfig();
        } else if (userRole === "evaluator") {
          adminSection.style.display = "none";
        } else {
          showError("Access Denied", "The evaluator dashboard requires evaluator or admin privileges. Your current role is: " + userRole);
          return;
        }

        loadDashboard();
      })
      .catch(function (err) {
        // Backend unavailable — fallback to demo mode
        loadDemoMode();
      });
  }

  // ── Demo Mode ─────────────────────────────────────────────────
  function loadDemoMode() {
    userRole = "admin";
    roleText.textContent = "Admin";
    roleBadge.style.background = "rgba(245, 158, 11, 0.12)";
    roleBadge.style.color = "#f59e0b";
    roleBadge.style.borderColor = "rgba(245, 158, 11, 0.25)";
    adminSection.style.display = "block";

    showContent();

    // Demo stats
    var demoStats = {
      total_submissions: 147,
      total_reports: 132,
      total_users: 38,
      average_authenticity_score: 21.4,
      submissions_by_status: { pending: 8, processing: 7, completed: 124, failed: 8 },
      reports_by_status: { clean: 89, review: 31, flagged: 12 },
    };

    renderStats(demoStats);

    // Demo submissions
    allSubmissions = [
      { id: "a1b2c3", title: "Machine Learning Survey Paper", original_filename: "ml_survey.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-26T10:15:00Z", user_name: "Priya Sharma", user_email: "priya@university.edu", report_score: 8.2, report_verdict: "clean" },
      { id: "d4e5f6", title: "Neural Network Architecture Review", original_filename: "nn_review.docx", file_type: "docx", status: "completed", uploaded_at: "2026-10-26T09:40:00Z", user_name: "Rahul Verma", user_email: "rahul@university.edu", report_score: 34.7, report_verdict: "review" },
      { id: "g7h8i9", title: "Plagiarism Detection Methods", original_filename: "plagiarism_methods.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-25T14:22:00Z", user_name: "Ananya Gupta", user_email: "ananya@university.edu", report_score: 72.1, report_verdict: "flagged" },
      { id: "j0k1l2", title: "Data Structures Assignment", original_filename: "ds_assignment.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-25T11:00:00Z", user_name: "Vikram Singh", user_email: "vikram@university.edu", report_score: 5.0, report_verdict: "clean" },
      { id: "m3n4o5", title: "Cloud Computing Report", original_filename: "cloud_computing.docx", file_type: "docx", status: "processing", uploaded_at: "2026-10-26T12:30:00Z", user_name: "Sneha Patel", user_email: "sneha@university.edu", report_score: null, report_verdict: null },
      { id: "p6q7r8", title: "Operating Systems Lab Report", original_filename: "os_lab.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-24T16:45:00Z", user_name: "Arjun Reddy", user_email: "arjun@university.edu", report_score: 42.8, report_verdict: "review" },
      { id: "s9t0u1", title: "Database Normalization Paper", original_filename: "db_normalization.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-24T09:10:00Z", user_name: "Kavya Nair", user_email: "kavya@university.edu", report_score: 12.3, report_verdict: "clean" },
      { id: "v2w3x4", title: "Cryptography Research Essay", original_filename: "crypto_research.docx", file_type: "docx", status: "failed", uploaded_at: "2026-10-23T18:55:00Z", user_name: "Mohit Kumar", user_email: "mohit@university.edu", report_score: null, report_verdict: null },
      { id: "y5z6a7", title: "Software Engineering Principles", original_filename: "se_principles.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-23T13:20:00Z", user_name: "Divya Joshi", user_email: "divya@university.edu", report_score: 18.9, report_verdict: "clean" },
      { id: "b8c9d0", title: "Computer Vision Thesis Draft", original_filename: "cv_thesis.pdf", file_type: "pdf", status: "pending", uploaded_at: "2026-10-26T13:00:00Z", user_name: "Rohan Desai", user_email: "rohan@university.edu", report_score: null, report_verdict: null },
      { id: "e1f2g3", title: "Web Development Project Report", original_filename: "webdev_project.pdf", file_type: "pdf", status: "completed", uploaded_at: "2026-10-22T10:35:00Z", user_name: "Meera Iyer", user_email: "meera@university.edu", report_score: 55.6, report_verdict: "flagged" },
      { id: "h4i5j6", title: "Distributed Systems Analysis", original_filename: "distributed_sys.docx", file_type: "docx", status: "completed", uploaded_at: "2026-10-22T08:00:00Z", user_name: "Aditya Rao", user_email: "aditya@university.edu", report_score: 27.3, report_verdict: "review" },
    ];

    applyFiltersAndRender();

    // Set default weight sliders
    setSliderValues({
      plagiarism: 0.30,
      similarity: 0.25,
      ai_detection: 0.25,
      manipulation: 0.20,
    });
  }

  function showError(title, desc) {
    loadingEl.style.display = "none";
    errorEl.style.display = "flex";
    contentEl.style.display = "none";
    errorTitle.textContent = title;
    errorDesc.textContent = desc;
  }

  function showContent() {
    loadingEl.style.display = "none";
    errorEl.style.display = "none";
    contentEl.style.display = "block";
  }

  // ── Load Dashboard Data ───────────────────────────────────────
  function loadDashboard() {
    Promise.all([
      apiFetch("/admin/stats").catch(function () { return null; }),
      apiFetch("/admin/submissions-all").catch(function () { return []; }),
    ])
      .then(function (results) {
        var stats = results[0];
        var subs = results[1];

        showContent();

        if (stats) renderStats(stats);
        allSubmissions = Array.isArray(subs) ? subs : [];
        applyFiltersAndRender();
      })
      .catch(function (err) {
        showError("Failed to Load", "Error fetching dashboard data: " + err.message);
      });
  }

  // ── Render Stats Cards ────────────────────────────────────────
  function renderStats(stats) {
    animateCounter(statTotalSubs, stats.total_submissions || 0);
    animateCounter(statTotalReports, stats.total_reports || 0);
    animateCounter(statTotalUsers, stats.total_users || 0);

    if (stats.average_authenticity_score != null) {
      statAvgScore.textContent = stats.average_authenticity_score.toFixed(1) + "%";
    } else {
      statAvgScore.textContent = "—";
    }

    renderDonut(stats.submissions_by_status || {}, stats.total_submissions || 0);
    renderBarChart(stats.reports_by_status || {});
  }

  function animateCounter(el, target) {
    var current = 0;
    var step = Math.max(1, Math.floor(target / 30));
    var interval = setInterval(function () {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      el.textContent = current.toLocaleString();
    }, 30);
  }

  // ── Donut Chart ───────────────────────────────────────────────
  function renderDonut(statusCounts, total) {
    donutTotal.textContent = total;

    var statusConfig = [
      { key: "pending", label: "Pending", color: "#94a3b8" },
      { key: "processing", label: "Processing", color: "#3b82f6" },
      { key: "completed", label: "Completed", color: "#22c55e" },
      { key: "failed", label: "Failed", color: "#ef4444" },
    ];

    // Remove old segments
    var oldSegs = donutSvg.querySelectorAll(".donut-segment");
    for (var i = 0; i < oldSegs.length; i++) {
      donutSvg.removeChild(oldSegs[i]);
    }

    var circumference = 2 * Math.PI * 78;
    var offset = 0;

    legendSubs.innerHTML = "";

    statusConfig.forEach(function (cfg) {
      var count = statusCounts[cfg.key] || 0;
      var pct = total > 0 ? count / total : 0;

      if (count > 0) {
        var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "donut-segment");
        circle.setAttribute("cx", "100");
        circle.setAttribute("cy", "100");
        circle.setAttribute("r", "78");
        circle.setAttribute("stroke", cfg.color);
        circle.setAttribute("stroke-dasharray", (pct * circumference) + " " + circumference);
        circle.setAttribute("stroke-dashoffset", -offset + "");
        donutSvg.appendChild(circle);
        offset += pct * circumference;
      }

      var legendItem = document.createElement("div");
      legendItem.className = "legend-item";
      legendItem.innerHTML =
        '<span class="legend-dot" style="background:' + cfg.color + '"></span>' +
        '<span>' + cfg.label + '</span>' +
        '<span class="legend-count mono">' + count + '</span>';
      legendSubs.appendChild(legendItem);
    });
  }

  // ── Bar Chart ─────────────────────────────────────────────────
  function renderBarChart(reportCounts) {
    var clean = reportCounts["clean"] || 0;
    var review = reportCounts["review"] || 0;
    var flagged = reportCounts["flagged"] || 0;
    var max = Math.max(clean, review, flagged, 1);

    barCountClean.textContent = clean;
    barCountReview.textContent = review;
    barCountFlagged.textContent = flagged;

    setTimeout(function () {
      barClean.style.height = Math.max((clean / max) * 100, 4) + "%";
      barReview.style.height = Math.max((review / max) * 100, 4) + "%";
      barFlagged.style.height = Math.max((flagged / max) * 100, 4) + "%";
    }, 100);
  }

  // ── Submissions Table ─────────────────────────────────────────
  function applyFiltersAndRender() {
    var search = (tableSearch.value || "").toLowerCase().trim();
    var statusVal = filterStatus.value;
    var verdictVal = filterVerdict.value;

    filteredSubmissions = allSubmissions.filter(function (sub) {
      if (search) {
        var title = (sub.title || "").toLowerCase();
        var filename = (sub.original_filename || "").toLowerCase();
        if (title.indexOf(search) === -1 && filename.indexOf(search) === -1) return false;
      }
      if (statusVal !== "all" && sub.status !== statusVal) return false;
      if (verdictVal !== "all") {
        var v = sub.report_verdict || "none";
        if (v !== verdictVal) return false;
      }
      return true;
    });

    sortSubmissions();
    currentPage = 1;
    renderTable();
    renderPagination();
  }

  function sortSubmissions() {
    filteredSubmissions.sort(function (a, b) {
      var va, vb;
      switch (sortKey) {
        case "title":
          va = (a.title || a.original_filename || "").toLowerCase();
          vb = (b.title || b.original_filename || "").toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "user":
          va = (a.user_email || "").toLowerCase();
          vb = (b.user_email || "").toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "status":
          va = a.status || "";
          vb = b.status || "";
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "score":
          va = a.report_score != null ? a.report_score : -1;
          vb = b.report_score != null ? b.report_score : -1;
          return sortDir === "asc" ? va - vb : vb - va;
        case "verdict":
          va = a.report_verdict || "zzz";
          vb = b.report_verdict || "zzz";
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "date":
        default:
          va = new Date(a.uploaded_at || 0).getTime();
          vb = new Date(b.uploaded_at || 0).getTime();
          return sortDir === "asc" ? va - vb : vb - va;
      }
    });
  }

  function renderTable() {
    var start = (currentPage - 1) * pageSize;
    var end = start + pageSize;
    var pageData = filteredSubmissions.slice(start, end);

    if (pageData.length === 0) {
      tableBody.innerHTML =
        '<tr class="table-empty-row"><td colspan="7">' +
        '<i class="fa-regular fa-folder-open"></i>' +
        'No submissions found matching your filters.' +
        '</td></tr>';
      resultCount.textContent = "0 submissions";
      return;
    }

    var html = "";
    pageData.forEach(function (sub) {
      var score = sub.report_score;
      var verdict = sub.report_verdict || "none";
      var scoreClass = getScoreClass(verdict);
      var date = sub.uploaded_at ? formatDate(sub.uploaded_at) : "—";

      html +=
        '<tr>' +
        '<td>' +
        '  <div class="doc-cell">' +
        '    <span class="doc-cell-title">' + escapeHtml(sub.title || sub.original_filename) + '</span>' +
        '    <span class="doc-cell-filename mono">' + escapeHtml(sub.original_filename) + '</span>' +
        '  </div>' +
        '</td>' +
        '<td>' + escapeHtml(sub.user_email || sub.user_name || "—") + '</td>' +
        '<td><span class="status-pill status-pill-' + sub.status + '">' + capitalizeFirst(sub.status) + '</span></td>' +
        '<td><span class="score-cell mono ' + scoreClass + '">' + (score != null ? score.toFixed(1) + '%' : '—') + '</span></td>' +
        '<td>' + renderVerdictPill(verdict) + '</td>' +
        '<td class="mono">' + date + '</td>' +
        '<td>' +
        '  <a href="report.html?id=' + sub.id + '" class="action-btn-sm" title="View Report">' +
        '    <i class="fa-solid fa-arrow-up-right-from-square"></i>' +
        '  </a>' +
        '</td>' +
        '</tr>';
    });

    tableBody.innerHTML = html;
    resultCount.textContent = filteredSubmissions.length + " submission" + (filteredSubmissions.length !== 1 ? "s" : "");
  }

  function renderPagination() {
    var totalPages = Math.ceil(filteredSubmissions.length / pageSize) || 1;
    var html = "";

    html += '<button class="page-btn" ' + (currentPage <= 1 ? 'disabled' : '') + ' data-page="' + (currentPage - 1) + '">' +
      '<i class="fa-solid fa-chevron-left"></i></button>';

    var startPage = Math.max(1, currentPage - 2);
    var endPage = Math.min(totalPages, currentPage + 2);

    for (var i = startPage; i <= endPage; i++) {
      html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }

    html += '<button class="page-btn" ' + (currentPage >= totalPages ? 'disabled' : '') + ' data-page="' + (currentPage + 1) + '">' +
      '<i class="fa-solid fa-chevron-right"></i></button>';

    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll(".page-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var page = parseInt(this.dataset.page);
        if (page >= 1 && page <= totalPages) {
          currentPage = page;
          renderTable();
          renderPagination();
        }
      });
    });
  }

  // ── Table Sort ────────────────────────────────────────────────
  document.querySelectorAll(".sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = this.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }

      document.querySelectorAll(".sortable").forEach(function (h) {
        h.classList.remove("sort-active");
      });
      this.classList.add("sort-active");

      var icon = this.querySelector(".sort-icon");
      icon.className = "fa-solid sort-icon " +
        (sortDir === "asc" ? "fa-sort-up" : "fa-sort-down");

      sortSubmissions();
      currentPage = 1;
      renderTable();
      renderPagination();
    });
  });

  // ── Table Filters ─────────────────────────────────────────────
  tableSearch.addEventListener("input", debounce(applyFiltersAndRender, 250));
  filterStatus.addEventListener("change", applyFiltersAndRender);
  filterVerdict.addEventListener("change", applyFiltersAndRender);

  // ── Weight Config (Admin) ─────────────────────────────────────
  function loadWeightConfig() {
    apiFetch("/admin/weight-config")
      .then(function (config) {
        setSliderValues(config);
      })
      .catch(function () {
        // Use defaults
        setSliderValues({
          plagiarism: 0.30,
          similarity: 0.25,
          ai_detection: 0.25,
          manipulation: 0.20,
        });
      });
  }

  function setSliderValues(config) {
    sliders.plagiarism.value = Math.round(config.plagiarism * 100);
    sliders.similarity.value = Math.round(config.similarity * 100);
    sliders.ai_detection.value = Math.round(config.ai_detection * 100);
    sliders.manipulation.value = Math.round(config.manipulation * 100);
    updateWeightDisplays();
  }

  function updateWeightDisplays() {
    var vals = {
      plagiarism: parseInt(sliders.plagiarism.value) / 100,
      similarity: parseInt(sliders.similarity.value) / 100,
      ai_detection: parseInt(sliders.ai_detection.value) / 100,
      manipulation: parseInt(sliders.manipulation.value) / 100,
    };

    displays.plagiarism.textContent = vals.plagiarism.toFixed(2);
    displays.similarity.textContent = vals.similarity.toFixed(2);
    displays.ai_detection.textContent = vals.ai_detection.toFixed(2);
    displays.manipulation.textContent = vals.manipulation.toFixed(2);

    // Update sum bar segments
    var total = vals.plagiarism + vals.similarity + vals.ai_detection + vals.manipulation;
    var scale = total > 0 ? 100 / total : 0;

    sumSegs.plagiarism.style.width = (vals.plagiarism * scale) + "%";
    sumSegs.similarity.style.width = (vals.similarity * scale) + "%";
    sumSegs.ai_detection.style.width = (vals.ai_detection * scale) + "%";
    sumSegs.manipulation.style.width = (vals.manipulation * scale) + "%";

    sumValue.textContent = total.toFixed(2);

    if (Math.abs(total - 1.0) <= 0.01) {
      sumStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Valid';
      sumStatus.className = "sum-status valid";
      btnSaveWeights.disabled = false;
    } else {
      sumStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Must equal 1.00';
      sumStatus.className = "sum-status invalid";
      btnSaveWeights.disabled = true;
    }
  }

  // Slider event listeners
  Object.keys(sliders).forEach(function (key) {
    sliders[key].addEventListener("input", updateWeightDisplays);
  });

  // Reset defaults
  if (btnResetWeights) {
    btnResetWeights.addEventListener("click", function () {
      setSliderValues({
        plagiarism: 0.30,
        similarity: 0.25,
        ai_detection: 0.25,
        manipulation: 0.20,
      });
    });
  }

  // Save weights
  if (weightsForm) {
    weightsForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var payload = {
        plagiarism: parseInt(sliders.plagiarism.value) / 100,
        similarity: parseInt(sliders.similarity.value) / 100,
        ai_detection: parseInt(sliders.ai_detection.value) / 100,
        manipulation: parseInt(sliders.manipulation.value) / 100,
      };

      var total = payload.plagiarism + payload.similarity + payload.ai_detection + payload.manipulation;
      if (Math.abs(total - 1.0) > 0.01) {
        showToast("Weights must sum to 1.00. Current: " + total.toFixed(3), true);
        return;
      }

      btnSaveWeights.disabled = true;
      btnSaveWeights.querySelector("span").textContent = "Saving...";

      apiFetch("/admin/weight-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      })
        .then(function (result) {
          showToast("Weights saved successfully! New config applied to all future scoring runs.", false);
          setSliderValues(result);
        })
        .catch(function (err) {
          showToast("Failed to save: " + err.message, true);
        })
        .finally(function () {
          btnSaveWeights.disabled = false;
          btnSaveWeights.querySelector("span").textContent = "Save Configuration";
        });
    });
  }

  function showToast(msg, isError) {
    weightsToast.style.display = "flex";
    weightsToast.className = "weights-toast " + (isError ? "toast-error" : "toast-success");
    weightsToast.querySelector("i").className = "fa-solid " + (isError ? "fa-circle-xmark" : "fa-circle-check");
    weightsToastMsg.textContent = msg;

    setTimeout(function () {
      weightsToast.style.display = "none";
    }, 5000);
  }

  // ── Refresh ───────────────────────────────────────────────────
  if (btnRefresh) {
    btnRefresh.addEventListener("click", function () {
      contentEl.style.display = "none";
      loadingEl.style.display = "flex";
      errorEl.style.display = "none";
      loadDashboard();
    });
  }

  // ── Utilities ─────────────────────────────────────────────────
  function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "—";
    }
  }

  function getScoreClass(verdict) {
    switch (verdict) {
      case "clean": return "score-cell-clean";
      case "review": return "score-cell-review";
      case "flagged": return "score-cell-flagged";
      default: return "score-cell-none";
    }
  }

  function renderVerdictPill(verdict) {
    var label = capitalizeFirst(verdict);
    var icon = "";
    switch (verdict) {
      case "clean":
        icon = '<i class="fa-solid fa-circle-check"></i>';
        return '<span class="verdict-pill verdict-clean">' + icon + ' ' + label + '</span>';
      case "review":
        icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        return '<span class="verdict-pill verdict-review">' + icon + ' ' + label + '</span>';
      case "flagged":
        icon = '<i class="fa-solid fa-circle-xmark"></i>';
        return '<span class="verdict-pill verdict-flagged">' + icon + ' ' + label + '</span>';
      default:
        return '<span class="verdict-pill verdict-none"><i class="fa-regular fa-circle"></i> N/A</span>';
    }
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  // ── Boot ──────────────────────────────────────────────────────
  init();
})();
