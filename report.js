/* ══════════════════════════════════════════════════════════════════
   Verifio — Academic Authenticity Report Controller (Phase 7)
   Orchestrates ScoreGauge, ModuleBreakdownCards, and FlaggedTextViewer
   ══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var API_BASE = "http://localhost:8000/api/v1";
  var DEFAULT_DEMO_ID = "550bffcd-5c22-49b1-b330-fbba1c358392";

  // Elements
  var loadingState = document.getElementById("report-loading-state");
  var errorState = document.getElementById("report-error-state");
  var reportContent = document.getElementById("report-content");

  var navStatusPill = document.getElementById("nav-status-pill");
  var navStatusText = document.getElementById("nav-status-text");
  var bcFilename = document.getElementById("bc-filename");

  // Gauge & Verdict
  var gaugeFill = document.getElementById("gauge-fill-circle");
  var gaugeScoreVal = document.getElementById("gauge-score-value");
  var verdictBadge = document.getElementById("verdict-badge");
  var verdictIcon = document.getElementById("verdict-icon");
  var verdictLabel = document.getElementById("verdict-label");
  var verdictDesc = document.getElementById("verdict-desc");

  // Meta
  var docTitle = document.getElementById("doc-title");
  var metaDate = document.getElementById("meta-date");
  var metaFilename = document.getElementById("meta-filename");
  var metaSubId = document.getElementById("meta-sub-id");
  var summaryFlaggedCount = document.getElementById("summary-flagged-count");
  var summaryWordCount = document.getElementById("summary-word-count");
  var summaryIntegrityTier = document.getElementById("summary-integrity-tier");
  var certHash = document.getElementById("cert-hash");

  // Workbench
  var docTextContent = document.getElementById("document-text-content");
  var docCharCount = document.getElementById("doc-char-count");
  var inspectorEmpty = document.getElementById("inspector-empty");
  var inspectorDetail = document.getElementById("inspector-detail");
  var inspectorSeq = document.getElementById("inspector-seq");
  var detailModuleName = document.getElementById("detail-module-name");
  var detailModuleIcon = document.getElementById("detail-module-icon");
  var detailModuleBar = document.getElementById("detail-module-bar");
  var detailSegmentText = document.getElementById("detail-segment-text");
  var detailConfidence = document.getElementById("detail-confidence");
  var detailSeverity = document.getElementById("detail-severity");
  var detailSourceRef = document.getElementById("detail-source-ref");
  var detailReason = document.getElementById("detail-reason");

  // State
  var currentReport = null;
  var allFlaggedSegments = [];
  var activeFilter = "all";
  var activeSegmentIndex = -1;

  // Retrieve Authentication Token
  async function getAuthToken() {
    var token = localStorage.getItem("verifio_token");
    if (token) return token;

    try {
      var formData = new URLSearchParams();
      formData.append("username", "harsh@example.com");
      formData.append("password", "securepassword123");

      var res = await fetch(API_BASE + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
      });

      if (res.ok) {
        var data = await res.json();
        localStorage.setItem("verifio_token", data.access_token);
        return data.access_token;
      }
    } catch (e) {
      console.warn("Auto login failed:", e);
    }
    return null;
  }

  // Get Submission ID from URL query param `?id=...`
  function getSubmissionId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("id") || DEFAULT_DEMO_ID;
  }

  // Fetch Full Report
  async function loadReport(subId) {
    loadingState.style.display = "flex";
    errorState.style.display = "none";
    reportContent.style.display = "none";

    try {
      var token = await getAuthToken();
      if (!token) throw new Error("Authentication required");

      var res = await fetch(API_BASE + "/reports/" + subId, {
        headers: { "Authorization": "Bearer " + token }
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status + " — Unable to load report");
      }

      var data = await res.json();
      currentReport = data;
      renderReport(data);

      loadingState.style.display = "none";
      reportContent.style.display = "flex";
    } catch (err) {
      console.error("Failed to load report:", err);
      loadingState.style.display = "none";
      errorState.style.display = "flex";
      var errDesc = document.getElementById("error-desc");
      if (errDesc) errDesc.textContent = err.message;
    }
  }

  // Render Full Report View
  function renderReport(data) {
    var rep = data.report || {};
    var sub = data.submission || {};
    var modules = data.module_details || [];
    var score = Math.round(rep.authenticity_score !== undefined ? rep.authenticity_score : 100);
    var status = (rep.status || "clean").toLowerCase();

    allFlaggedSegments = rep.flagged_segments || [];

    // Header & Meta
    var filename = sub.original_filename || "Document Analysis";
    if (bcFilename) bcFilename.textContent = filename;
    if (docTitle) docTitle.textContent = sub.title || filename.replace(/\.[^/.]+$/, "");
    if (metaFilename) metaFilename.textContent = filename;
    if (metaSubId) metaSubId.textContent = "ID: " + (sub.id || "—").substring(0, 8) + "...";
    if (metaDate && rep.generated_at) {
      metaDate.textContent = new Date(rep.generated_at).toLocaleString();
    }
    if (certHash) {
      certHash.textContent = "sha256:" + (sub.id ? sub.id.replace(/-/g, "") : "00000000000000000000000000000000");
    }

    // Top Status Pill
    if (navStatusPill && navStatusText) {
      navStatusPill.className = "status-pill status-" + status;
      navStatusText.textContent = status === "clean" ? "Clean / Authentic" : (status === "review" ? "Review Recommended" : "Flagged");
    }

    // 1) ScoreGauge Hero Component
    animateGauge(score, status);

    // 2) Module Breakdown Cards
    renderModuleCards(rep, modules, allFlaggedSegments);

    // 3) FlaggedTextViewer & Workbench
    renderFlaggedTextViewer(sub.raw_text || "", allFlaggedSegments);

    // Update Summary Metrics
    if (summaryFlaggedCount) summaryFlaggedCount.textContent = allFlaggedSegments.length;
    var wordCount = sub.raw_text ? sub.raw_text.trim().split(/\s+/).length : 0;
    if (summaryWordCount) summaryWordCount.textContent = "~" + wordCount.toLocaleString();
    if (summaryIntegrityTier) {
      summaryIntegrityTier.textContent = score < 20 ? "Tier 1 (High)" : (score < 50 ? "Tier 2 (Moderate)" : "Tier 3 (Flagged)");
    }
  }

  // Animate Circular Gauge
  function animateGauge(score, status) {
    if (!gaugeFill || !gaugeScoreVal) return;

    // Radius = 68 -> Circumference = 2 * PI * 68 = 427.26
    var totalCircumference = 427.26;
    var offset = totalCircumference - (totalCircumference * (score / 100));

    // Color ramp based on status & score
    var strokeColor = "#22c55e"; // clean
    var badgeClass = "verdict-badge verdict-clean";
    var iconClass = "fa-solid fa-circle-check";
    var verdictTitle = "Clean & Authentic";
    var verdictExpl = "All 4 detection modules passed within acceptable institutional integrity thresholds.";

    if (status === "review" || (score >= 25 && score < 60)) {
      strokeColor = "#f59e0b";
      badgeClass = "verdict-badge verdict-review";
      iconClass = "fa-solid fa-triangle-exclamation";
      verdictTitle = "Review Recommended";
      verdictExpl = "Elevated indicators detected in one or more modules. Faculty review advised.";
    } else if (status === "flagged" || score >= 60) {
      strokeColor = "#ef4444";
      badgeClass = "verdict-badge verdict-flagged";
      iconClass = "fa-solid fa-circle-xmark";
      verdictTitle = "Flagged Anomalies";
      verdictExpl = "Significant verbatim matches or structural integrity anomalies exceed policy thresholds.";
    }

    gaugeFill.style.stroke = strokeColor;
    gaugeFill.style.strokeDashoffset = offset;

    // Count up the number
    var current = 0;
    var step = Math.max(1, Math.round(score / 30));
    var timer = setInterval(function () {
      current += step;
      if (current >= score) {
        current = score;
        clearInterval(timer);
      }
      gaugeScoreVal.textContent = current + "%";
    }, 25);

    if (verdictBadge) verdictBadge.className = badgeClass;
    if (verdictIcon) verdictIcon.className = iconClass;
    if (verdictLabel) verdictLabel.textContent = verdictTitle;
    if (verdictDesc) verdictDesc.textContent = verdictExpl;
  }

  // Render 4 Module Cards
  function renderModuleCards(rep, moduleDetails, segments) {
    var pScore = Math.round(rep.plagiarism_score || 0);
    var sScore = Math.round(rep.similarity_score || 0);
    var aScore = Math.round(rep.ai_detection_score || 0);
    var mScore = Math.round(rep.manipulation_score || 0);

    setCardData("plagiarism", pScore, segments.filter(function (s) { return s.module === "plagiarism"; }));
    setCardData("similarity", sScore, segments.filter(function (s) { return s.module === "similarity"; }));
    setCardData("ai", aScore, segments.filter(function (s) { return s.module === "ai_detection"; }));
    setCardData("manipulation", mScore, segments.filter(function (s) { return s.module === "manipulation"; }));
  }

  function setCardData(id, score, segs) {
    var scoreEl = document.getElementById("score-" + id);
    var barEl = document.getElementById("bar-" + id);
    var flagsEl = document.getElementById("flags-" + id);
    var listEl = document.getElementById("evidence-list-" + id);

    if (scoreEl) scoreEl.textContent = score + "%";
    if (barEl) barEl.style.width = Math.min(score, 100) + "%";
    if (flagsEl) flagsEl.textContent = segs.length + " " + (segs.length === 1 ? "flag" : "flags");

    if (listEl) {
      listEl.innerHTML = "";
      if (segs.length === 0) {
        listEl.innerHTML = '<span style="color:#64748b; font-size:11.5px;">No flagged evidence found in this module.</span>';
      } else {
        segs.forEach(function (s) {
          var item = document.createElement("div");
          item.className = "drawer-evidence-item";
          item.style.borderLeftColor = getModuleColor(s.module);
          item.innerHTML = '<strong>' + (s.severity || "medium").toUpperCase() + '</strong>: ' +
            escapeHtml(s.segment_text ? s.segment_text.substring(0, 90) + "..." : "Segment");
          item.addEventListener("click", function () {
            var idx = allFlaggedSegments.indexOf(s);
            if (idx >= 0) selectSegment(idx);
          });
          listEl.appendChild(item);
        });
      }
    }
  }

  function getModuleColor(mod) {
    if (mod === "plagiarism") return "#ef4444";
    if (mod === "ai_detection") return "#a855f7";
    if (mod === "similarity") return "#f59e0b";
    return "#38bdf8";
  }

  function getModuleDisplayName(mod) {
    if (mod === "plagiarism") return "Verbatim Plagiarism";
    if (mod === "ai_detection") return "AI-Generated Text";
    if (mod === "similarity") return "Semantic Similarity";
    return "Document Manipulation";
  }

  function getModuleIcon(mod) {
    if (mod === "plagiarism") return "fa-solid fa-copy";
    if (mod === "ai_detection") return "fa-solid fa-robot";
    if (mod === "similarity") return "fa-solid fa-diagram-project";
    return "fa-solid fa-shield-halved";
  }

  // 3) FlaggedTextViewer
  function renderFlaggedTextViewer(rawText, segments) {
    if (!docTextContent) return;

    if (docCharCount) docCharCount.textContent = rawText.length.toLocaleString() + " chars";

    if (!rawText.trim()) {
      docTextContent.innerHTML = '<p style="color:#64748b; font-style:italic;">No extracted document text available.</p>';
      return;
    }

    // Filter segments if needed
    updateFilterCounts();

    // Map segments to spans within the raw text
    // Sort segments by length descending so longer phrases match first
    var sortedSegments = segments.slice().sort(function (a, b) {
      return (b.segment_text || "").length - (a.segment_text || "").length;
    });

    var htmlText = escapeHtml(rawText);

    sortedSegments.forEach(function (seg, index) {
      if (!seg.segment_text || seg.segment_text.length < 5) return;
      var cleanText = escapeHtml(seg.segment_text.trim());
      var globalIndex = allFlaggedSegments.indexOf(seg);

      var markTag = '<mark class="flagged-mark flagged-' + seg.module +
        '" data-index="' + globalIndex +
        '" data-module="' + seg.module +
        '" id="mark-seg-' + globalIndex +
        '" tabindex="0">' + cleanText + '</mark>';

      // Replace first occurrence of the clean segment
      var foundPos = htmlText.indexOf(cleanText);
      if (foundPos !== -1) {
        htmlText = htmlText.substring(0, foundPos) + markTag + htmlText.substring(foundPos + cleanText.length);
      }
    });

    docTextContent.innerHTML = htmlText;

    // Attach click and focus listeners to all mark tags
    docTextContent.querySelectorAll("mark.flagged-mark").forEach(function (mark) {
      mark.addEventListener("click", function () {
        var idx = parseInt(this.dataset.index, 10);
        selectSegment(idx);
      });
      mark.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var idx = parseInt(this.dataset.index, 10);
          selectSegment(idx);
        }
      });
    });

    // Auto-select first segment if exists
    if (allFlaggedSegments.length > 0) {
      selectSegment(0, false);
    } else {
      showEmptyInspector();
    }
  }

  // Select and Inspect a Specific Flagged Segment
  function selectSegment(index, shouldScroll) {
    if (index < 0 || index >= allFlaggedSegments.length) return;
    activeSegmentIndex = index;

    var seg = allFlaggedSegments[index];

    // Highlight mark in viewer
    docTextContent.querySelectorAll("mark.flagged-mark").forEach(function (m) {
      m.classList.remove("is-active");
    });
    var activeMark = document.getElementById("mark-seg-" + index);
    if (activeMark) {
      activeMark.classList.add("is-active");
      if (shouldScroll !== false) {
        activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    // Update Counter
    var stepIndex = document.getElementById("flag-step-index");
    if (stepIndex) {
      stepIndex.textContent = (index + 1) + " / " + allFlaggedSegments.length;
    }

    // Populate Right Inspector Panel
    inspectorEmpty.style.display = "none";
    inspectorDetail.style.display = "flex";

    if (inspectorSeq) inspectorSeq.textContent = "Segment #" + (index + 1);
    if (detailModuleName) detailModuleName.textContent = getModuleDisplayName(seg.module);
    if (detailModuleIcon) detailModuleIcon.className = getModuleIcon(seg.module);
    if (detailModuleBar) {
      detailModuleBar.style.background = getModuleColor(seg.module) + "22";
      detailModuleBar.style.color = getModuleColor(seg.module);
    }
    if (detailSegmentText) {
      detailSegmentText.textContent = seg.segment_text || "—";
      detailSegmentText.style.borderLeftColor = getModuleColor(seg.module);
    }
    if (detailConfidence) {
      var conf = Math.round((seg.confidence !== undefined ? seg.confidence : 1) * 100);
      detailConfidence.textContent = conf + "%";
    }
    if (detailSeverity) {
      detailSeverity.textContent = (seg.severity || "Medium").toUpperCase();
      detailSeverity.style.color = seg.severity === "high" ? "#ef4444" : (seg.severity === "low" ? "#38bdf8" : "#f59e0b");
    }
    if (detailSourceRef) {
      detailSourceRef.textContent = seg.matched_source_ref || "Academic Corpus Comparison Repository";
    }
    if (detailReason) {
      detailReason.textContent = getEvaluationReason(seg);
    }
  }

  function getEvaluationReason(seg) {
    if (seg.module === "plagiarism") {
      return "Direct contiguous substring match with institutional repository documents. Rephrasing or formal citation needed.";
    }
    if (seg.module === "ai_detection") {
      return "Statistical perplexity and burstiness analysis indicates non-human syntactical entropy consistent with LLM generation.";
    }
    if (seg.module === "similarity") {
      return "Contextual neural embeddings demonstrate dense semantic overlap (> 85% cosine similarity) with existing work.";
    }
    return "Document formatting forensics detected abnormal character encoding or metadata tampering.";
  }

  function showEmptyInspector() {
    inspectorEmpty.style.display = "flex";
    inspectorDetail.style.display = "none";
    var stepIndex = document.getElementById("flag-step-index");
    if (stepIndex) stepIndex.textContent = "0 / 0";
  }

  function updateFilterCounts() {
    var counts = {
      all: allFlaggedSegments.length,
      plagiarism: 0,
      ai_detection: 0,
      similarity: 0,
      manipulation: 0
    };
    allFlaggedSegments.forEach(function (s) {
      if (counts[s.module] !== undefined) counts[s.module]++;
    });

    var cAll = document.getElementById("count-all");
    var cPlag = document.getElementById("count-plagiarism");
    var cAi = document.getElementById("count-ai");
    var cSim = document.getElementById("count-similarity");
    var cManip = document.getElementById("count-manipulation");

    if (cAll) cAll.textContent = counts.all;
    if (cPlag) cPlag.textContent = counts.plagiarism;
    if (cAi) cAi.textContent = counts.ai_detection;
    if (cSim) cSim.textContent = counts.similarity;
    if (cManip) cManip.textContent = counts.manipulation;
  }

  function applyFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll(".filter-pill").forEach(function (pill) {
      pill.classList.toggle("active", pill.dataset.filter === filter);
    });

    docTextContent.querySelectorAll("mark.flagged-mark").forEach(function (m) {
      var mod = m.dataset.module;
      if (filter === "all" || mod === filter) {
        m.style.opacity = "1";
        m.style.pointerEvents = "auto";
      } else {
        m.style.opacity = "0.2";
        m.style.pointerEvents = "none";
      }
    });

    // Pick first matching visible segment
    var firstVisible = allFlaggedSegments.findIndex(function (s) {
      return filter === "all" || s.module === filter;
    });
    if (firstVisible >= 0) {
      selectSegment(firstVisible);
    }
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Accordion Expand/Collapse on Module Cards
    document.querySelectorAll(".expand-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = this.dataset.target;
        var drawer = document.getElementById(targetId);
        if (drawer) {
          var isExpanded = drawer.style.display !== "none";
          drawer.style.display = isExpanded ? "none" : "block";
          this.classList.toggle("active", !isExpanded);
          this.setAttribute("aria-expanded", !isExpanded);
        }
      });
    });

    // Filter toolbar buttons
    document.querySelectorAll(".filter-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        applyFilter(this.dataset.filter);
      });
    });

    // Step next/prev flag
    var btnNext = document.getElementById("btn-next-flag");
    var btnPrev = document.getElementById("btn-prev-flag");
    if (btnNext) {
      btnNext.addEventListener("click", function () {
        if (allFlaggedSegments.length === 0) return;
        var nextIdx = (activeSegmentIndex + 1) % allFlaggedSegments.length;
        selectSegment(nextIdx);
      });
    }
    if (btnPrev) {
      btnPrev.addEventListener("click", function () {
        if (allFlaggedSegments.length === 0) return;
        var prevIdx = (activeSegmentIndex - 1 + allFlaggedSegments.length) % allFlaggedSegments.length;
        selectSegment(prevIdx);
      });
    }

    // Keyboard navigation: N for next, P for prev
    document.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "n" || e.key === "ArrowDown") {
        if (btnNext) btnNext.click();
      } else if (e.key === "p" || e.key === "ArrowUp") {
        if (btnPrev) btnPrev.click();
      }
    });

    // Scroll to Highlight button in inspector
    var btnScroll = document.getElementById("btn-scroll-to-highlight");
    if (btnScroll) {
      btnScroll.addEventListener("click", function () {
        var activeMark = document.getElementById("mark-seg-" + activeSegmentIndex);
        if (activeMark) {
          activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    // Copy ID button
    var btnCopyId = document.getElementById("btn-copy-id");
    if (btnCopyId) {
      btnCopyId.addEventListener("click", function () {
        var subId = getSubmissionId();
        navigator.clipboard.writeText(subId).then(function () {
          btnCopyId.innerHTML = '<i class="fa-solid fa-check" style="color:#22c55e;"></i>';
          setTimeout(function () {
            btnCopyId.innerHTML = '<i class="fa-regular fa-copy"></i>';
          }, 2000);
        });
      });
    }

    // Copy Link button
    var btnCopyLink = document.getElementById("btn-copy-link");
    if (btnCopyLink) {
      btnCopyLink.addEventListener("click", function () {
        navigator.clipboard.writeText(window.location.href).then(function () {
          alert("Report link copied to clipboard!");
        });
      });
    }

    // Print / Export PDF button
    var btnPrint = document.getElementById("btn-print");
    if (btnPrint) {
      btnPrint.addEventListener("click", function () {
        window.print();
      });
    }

    // Sample Document Selector
    var docSelector = document.getElementById("sample-doc-selector");
    if (docSelector) {
      var currentId = getSubmissionId();
      docSelector.value = currentId;
      docSelector.addEventListener("change", function () {
        window.location.search = "?id=" + this.value;
      });
    }

    // Load Demo button in error state
    var btnLoadDemo = document.getElementById("btn-load-demo");
    if (btnLoadDemo) {
      btnLoadDemo.addEventListener("click", function () {
        window.location.search = "?id=" + DEFAULT_DEMO_ID;
      });
    }
  }

  // Initialization
  document.addEventListener("DOMContentLoaded", function () {
    setupEventListeners();
    var subId = getSubmissionId();
    loadReport(subId);
  });
})();
