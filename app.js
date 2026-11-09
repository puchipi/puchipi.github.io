/**
 * SEIS // RETRO — Lógica Principal
 * - 3 Modos de Galería (Semanas, Mosaico, Polaroid)
 * - Visor de Foto idéntico al boceto: [FOTO VERTICAL] + [ 💬   ♡   XX/XX ]
 * - Cámara con filtro único POLAROID + Zoom real (0.5x Ultra Gran Angular, 1x, 2x, Slider 0.5x–3.0x y Pinch-to-Zoom)
 */

(function () {
  const STORAGE_KEY = "seis_retro_state_v7";
  const SESSION_KEY = "seis_retro_session_user";

  const POLAROID_STYLE = {
    name: "POLAROID",
    mediaClass: "filter-fx-polaroid",
    overlayClass: "fx-polaroid",
    filmCode: "POLAROID 600 · INSTANT",
    canvasFilter: "contrast(1.08) brightness(1.05) sepia(0.24) saturate(1.26)"
  };

  let state = loadState();
  let currentUser = null;
  let pinBuffer = "";

  // Filtros de galería y modo de vista
  let selectedWeekId = "all";
  let selectedAuthorId = "all";
  let viewMode = "retro"; // 'retro' | 'masonry' | 'polaroid'

  // Visor de foto activa
  let activeModalPhotoId = null;
  let showSlotInsteadOfDate = false;
  let viewerZoom = 1;

  // Estado de Cámara / Subida de Foto
  let polaroidEnabled = true;
  let cameraZoom = 1.0; // 0.5x a 3.0x
  let cameraStream = null;
  let cameraFacingMode = "environment";
  let usingLiveCamera = false;
  let pendingUploadBlob = null;
  let pendingUploadDataUrl = "";
  let pendingUploadIsBaked = false;
  let isCapturedFrozen = false;

  // Estado de animación de la ruleta
  let wheelAngle = 0;
  let isSpinning = false;

  // =========================================================================
  // ESTADO Y ALMACENAMIENTO LOCAL
  // =========================================================================
  function sanitizeState(rawState) {
    if (!rawState || !Array.isArray(rawState.friends) || !Array.isArray(rawState.weeks)) {
      return null;
    }
    // Sincronizar perfiles y webhooks con la configuración actual
    rawState.friends = JSON.parse(JSON.stringify(window.SEIS_CONFIG.friends));

    rawState.weeks.forEach((week) => {
      if (!Array.isArray(week.photos)) week.photos = [];
      // Si la foto no tiene autor válido, asignarle el actual
      week.photos = week.photos.filter((p) => p && p.url);
    });
    return rawState;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = sanitizeState(JSON.parse(saved));
        if (parsed) return parsed;
      }
    } catch (e) {
      console.warn("Usando configuración inicial.", e);
    }
    return {
      friends: JSON.parse(JSON.stringify(window.SEIS_CONFIG.friends)),
      weeks: JSON.parse(JSON.stringify(window.SEIS_CONFIG.initialWeeks))
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Error guardando estado:", e);
    }
  }

  function getFriend(friendId) {
    return state.friends.find((f) => f.id === friendId) || state.friends[0];
  }

  function getCurrentWeek() {
    return state.weeks.find((w) => w.isCurrent) || state.weeks[0];
  }

  function getAllPhotosFiltered() {
    const list = [];
    state.weeks.forEach((week) => {
      if (selectedWeekId !== "all" && week.id !== selectedWeekId) return;
      week.photos.forEach((photo) => {
        if (selectedAuthorId !== "all" && photo.authorId !== selectedAuthorId) return;
        list.push({ ...photo, week });
      });
    });
    return list;
  }

  function getTodayShortDate() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  }

  function getLedDateStampString() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `'${yy} ${mm} ${dd}`;
  }

  // =========================================================================
  // SIDEBAR (MENÚ DE LAS 3 RAYAS EN LA ESQUINA)
  // =========================================================================
  function openSidebar() {
    document.getElementById("sidebar-backdrop").classList.remove("hidden");
    document.getElementById("sidebar-drawer").classList.add("open");
    document.getElementById("btn-open-sidebar")?.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.getElementById("sidebar-backdrop").classList.add("hidden");
    document.getElementById("sidebar-drawer").classList.remove("open");
    document.getElementById("btn-open-sidebar")?.setAttribute("aria-expanded", "false");
  }

  // =========================================================================
  // LOGIN CON CÓDIGO PIN DE 4 DÍGITOS + BANNER DE TURNO
  // =========================================================================
  function renderDemoLoginPills() {
    const container = document.getElementById("demo-friend-pills");
    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);

    // Actualizar el banner destacado de a quién le toca
    const turnAvatar = document.getElementById("login-turn-avatar");
    const turnName = document.getElementById("login-turn-name");
    const turnCount = document.getElementById("login-turn-count");
    if (turnAvatar && turnName && winner) {
      turnAvatar.textContent = winner.avatar;
      turnAvatar.style.background = winner.color;
      turnName.textContent = `Le toca a ${winner.name}`;
      if (turnCount) {
        turnCount.textContent = `${currentWeek.photos.length}/5 fotos`;
      }
    }

    if (!container) return;

    container.innerHTML = state.friends
      .map((f) => {
        const isTurn = f.id === currentWeek.selectedFriendId;
        return `
          <button type="button" class="demo-friend-btn" data-pin="${f.pin}">
            <span class="demo-friend-left">
              <span class="demo-dot" style="background:${f.color}"></span>
              <span>${f.name}${isTurn ? " ★" : ""}</span>
            </span>
            <span class="demo-pin-code">${f.pin}</span>
          </button>
        `;
      })
      .join("");

    container.querySelectorAll(".demo-friend-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pin = btn.getAttribute("data-pin");
        pinBuffer = "";
        for (const digit of pin) {
          handlePinDigit(digit);
        }
      });
    });
  }

  function updatePinDotsUI(isError = false) {
    const dots = document.querySelectorAll("#pin-dots .pin-dot");
    dots.forEach((dot, idx) => {
      const char = pinBuffer[idx] || "";
      dot.classList.toggle("filled", Boolean(char));
      dot.classList.toggle("error", isError);
      dot.querySelector("span").textContent = char ? "●" : "";
    });
  }

  function handlePinDigit(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    updatePinDotsUI(false);

    if (pinBuffer.length === 4) {
      verifyPinCode(pinBuffer);
    }
  }

  function verifyPinCode(code) {
    const statusText = document.getElementById("pin-status-text");
    const matchedFriend = state.friends.find((f) => f.pin === code);

    if (matchedFriend) {
      if (statusText) {
        statusText.textContent = `Hola, ${matchedFriend.name}`;
        statusText.style.color = "var(--accent-green)";
      }
      setTimeout(() => {
        loginAsFriend(matchedFriend.id);
        pinBuffer = "";
        updatePinDotsUI(false);
      }, 160);
    } else {
      if (statusText) {
        statusText.textContent = "PIN incorrecto";
        statusText.style.color = "#ef4444";
      }
      updatePinDotsUI(true);
      setTimeout(() => {
        pinBuffer = "";
        updatePinDotsUI(false);
      }, 420);
    }
  }

  function loginAsFriend(friendId) {
    const friend = getFriend(friendId);
    currentUser = friend;
    sessionStorage.setItem(SESSION_KEY, friend.id);

    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);
    const isMyTurn = currentUser.id === winner.id;

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");

    renderAll();

    // Mensaje claro de turno al iniciar sesión
    if (isMyTurn) {
      showToast(`⭐ ¡Es tu turno esta semana ${friend.name}! Puedes subir tus 5 fotos.`);
    } else {
      showToast(`👀 Hola ${friend.name}. Esta semana le toca subir fotos a ${winner.name}.`);
    }
  }

  function logout() {
    closeSidebar();
    stopCameraStream();
    currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    const statusText = document.getElementById("pin-status-text");
    if (statusText) {
      statusText.textContent = "4 dígitos";
      statusText.style.color = "var(--accent-warm)";
    }
    renderDemoLoginPills();
  }

  // =========================================================================
  // RENDERIZADO PRINCIPAL
  // =========================================================================
  function renderAll() {
    if (!currentUser) return;
    currentUser = getFriend(currentUser.id);
    renderMinimalTopbar();
    renderSidebar();
    renderGalleryViewBar();
    renderPhotosStage();
  }

  function renderMinimalTopbar() {
    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);
    const isMyTurn = currentUser.id === winner.id;
    const remaining = Math.max(0, 5 - currentWeek.photos.length);

    const topAvatar = document.getElementById("active-user-avatar");
    topAvatar.textContent = currentUser.avatar;
    topAvatar.style.background = currentUser.color;

    const subEl = document.getElementById("topbar-active-filter");
    subEl.textContent = `Turno: ${winner.name} (${currentWeek.photos.length}/5)`;

    const topUploadBtn = document.getElementById("btn-topbar-upload");
    const fabBtn = document.getElementById("btn-fab-upload");

    if (isMyTurn && remaining > 0) {
      topUploadBtn.classList.remove("hidden");
      document.getElementById("topbar-upload-count").textContent =
        `Subir (${currentWeek.photos.length}/5)`;
      fabBtn.classList.remove("hidden");
    } else {
      topUploadBtn.classList.add("hidden");
      fabBtn.classList.add("hidden");
    }
  }

  function renderSidebar() {
    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);
    const isMyTurn = currentUser.id === winner.id;
    const uploadedCount = currentWeek.photos.length;
    const remaining = Math.max(0, 5 - uploadedCount);

    const uAvatar = document.getElementById("sidebar-user-avatar");
    uAvatar.textContent = currentUser.avatar;
    uAvatar.style.background = currentUser.color;
    document.getElementById("sidebar-user-name").textContent = currentUser.name;
    document.getElementById("sidebar-user-handle").textContent = currentUser.handle;
    document.getElementById("sidebar-user-role").textContent = isMyTurn
      ? `★ Tu turno esta semana (${remaining} restantes)`
      : `Turno de ${winner.name}`;

    document.getElementById("sidebar-slots-counter").textContent = `${uploadedCount} / 5 FOTOS`;
    document.getElementById("sidebar-turn-title").textContent =
      `${currentWeek.title} · ${winner.name}`;
    document.getElementById("sidebar-turn-sub").textContent = currentWeek.dateRange;

    const stripEl = document.getElementById("sidebar-slots-strip");
    let slotsHtml = "";
    for (let i = 1; i <= 5; i++) {
      const photo = currentWeek.photos[i - 1];
      if (photo) {
        const fClass = photo.filter === "polaroid" && !photo.bakedFilter ? POLAROID_STYLE.mediaClass : "";
        slotsHtml += `
          <div class="slot-mini-card filled" data-sidebar-photo="${photo.id}" title="Foto 0${i}/05">
            <img src="${photo.url}" class="${fClass}" alt="" loading="lazy" />
          </div>
        `;
      } else {
        const canUpload = isMyTurn && i === uploadedCount + 1;
        slotsHtml += `
          <div class="slot-mini-card ${canUpload ? "can-upload" : ""}" ${canUpload ? 'data-sidebar-upload="true"' : ""}>
            <span class="slot-mini-num">0${i}</span>
            ${canUpload ? '<span class="slot-mini-plus">＋</span>' : ""}
          </div>
        `;
      }
    }
    stripEl.innerHTML = slotsHtml;

    stripEl.querySelectorAll("[data-sidebar-photo]").forEach((el) => {
      el.addEventListener("click", () => {
        closeSidebar();
        openPhotoModal(el.getAttribute("data-sidebar-photo"));
      });
    });
    stripEl.querySelectorAll("[data-sidebar-upload]").forEach((el) => {
      el.addEventListener("click", () => {
        closeSidebar();
        openUploadModal();
      });
    });

    const uploadBtn = document.getElementById("btn-sidebar-upload");
    const lockBox = document.getElementById("sidebar-lock-box");

    if (isMyTurn) {
      uploadBtn.classList.remove("hidden");
      lockBox.classList.add("hidden");
      if (remaining === 0) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "✓ 5 de 5 fotos subidas";
      } else {
        uploadBtn.disabled = false;
        uploadBtn.textContent = `＋ Tomar foto #0${uploadedCount + 1} de 05`;
      }
    } else {
      uploadBtn.classList.add("hidden");
      lockBox.classList.remove("hidden");
      document.getElementById("sidebar-lock-text").textContent =
        `🔒 Solo ${winner.name} puede subir hoy.`;
    }

    // Semanas
    const weeksList = document.getElementById("sidebar-weeks-list");
    const totalPhotos = state.weeks.reduce((acc, w) => acc + w.photos.length, 0);
    let weeksHtml = `
      <button type="button" class="sidebar-list-item ${selectedWeekId === "all" ? "active" : ""}" data-week-id="all">
        <span class="sidebar-item-left">
          <span>🎞️</span>
          <span>Todas las semanas</span>
        </span>
        <span class="mono-muted">${totalPhotos}</span>
      </button>
    `;

    state.weeks.forEach((w) => {
      const wWinner = getFriend(w.selectedFriendId);
      const isAct = selectedWeekId === w.id ? "active" : "";
      weeksHtml += `
        <button type="button" class="sidebar-list-item ${isAct}" data-week-id="${w.id}">
          <span class="sidebar-item-left">
            <span class="demo-dot" style="background:${wWinner.color}"></span>
            <span>${w.title} · ${wWinner.name}</span>
          </span>
          <span class="mono-muted">${w.photos.length}/5</span>
        </button>
      `;
    });
    weeksList.innerHTML = weeksHtml;

    weeksList.querySelectorAll("[data-week-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedWeekId = btn.getAttribute("data-week-id");
        closeSidebar();
        renderAll();
      });
    });

    // Autores
    const authorsList = document.getElementById("sidebar-authors-list");
    let authorsHtml = `
      <button type="button" class="sidebar-list-item ${selectedAuthorId === "all" ? "active" : ""}" data-author-id="all">
        <span class="sidebar-item-left">
          <span>👥</span>
          <span>Todos los autores</span>
        </span>
        <span class="mono-muted">6</span>
      </button>
    `;

    state.friends.forEach((f) => {
      const count = state.weeks.reduce(
        (acc, w) => acc + w.photos.filter((p) => p.authorId === f.id).length,
        0
      );
      const isAct = selectedAuthorId === f.id ? "active" : "";
      authorsHtml += `
        <button type="button" class="sidebar-list-item ${isAct}" data-author-id="${f.id}">
          <span class="sidebar-item-left">
            <span class="user-avatar-xs" style="background:${f.color}">${f.avatar}</span>
            <span>${f.name}</span>
          </span>
          <span class="mono-muted">${count}</span>
        </button>
      `;
    });
    authorsList.innerHTML = authorsHtml;

    authorsList.querySelectorAll("[data-author-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedAuthorId = btn.getAttribute("data-author-id");
        closeSidebar();
        renderAll();
      });
    });
  }

  function renderGalleryViewBar() {
    document.querySelectorAll(".gallery-view-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewMode);
    });

    const container = document.getElementById("active-filter-banner");
    let label = "ARCHIVO COMPLETO";
    let hasFilter = false;

    if (selectedWeekId !== "all" && selectedAuthorId !== "all") {
      const w = state.weeks.find((x) => x.id === selectedWeekId);
      const f = getFriend(selectedAuthorId);
      label = `${w ? w.title : ""} · ${f.name}`;
      hasFilter = true;
    } else if (selectedAuthorId !== "all") {
      const f = getFriend(selectedAuthorId);
      label = `AUTOR: ${f.name.toUpperCase()}`;
      hasFilter = true;
    } else if (selectedWeekId !== "all") {
      const w = state.weeks.find((x) => x.id === selectedWeekId);
      if (w) label = `${w.title.toUpperCase()} (${w.dateRange})`;
      hasFilter = true;
    }

    container.innerHTML = `
      <span class="mono-label">${escapeHtml(label)}</span>
      ${
        hasFilter
          ? `<button type="button" class="btn-clear-filter-chip" id="btn-clear-inline-filter">✕ Todo</button>`
          : ""
      }
    `;

    document.getElementById("btn-clear-inline-filter")?.addEventListener("click", () => {
      selectedWeekId = "all";
      selectedAuthorId = "all";
      renderAll();
    });
  }

  // =========================================================================
  // GALERÍA PRINCIPAL (SEMANAS, MOSAICO, POLAROID)
  // =========================================================================
  function renderPhotoVisualLayers(photo) {
    const useLivePolaroid = photo.filter === "polaroid" && !photo.bakedFilter;
    const zVal = typeof photo.zoom === "number" && !photo.bakedFilter ? photo.zoom : 1;

    let styleAttr = "";
    let bgHtml = "";
    if (zVal < 1) {
      const scaleOut = 0.76 + ((zVal - 0.5) / 0.5) * 0.24;
      styleAttr = `style="transform:scale(${scaleOut.toFixed(2)});object-fit:contain;border-radius:8px"`;
      bgHtml = `<img src="${photo.url}" class="viewer-media-fit viewfinder-bg-wide" alt="" aria-hidden="true" loading="lazy" />`;
    } else if (zVal > 1) {
      styleAttr = `style="transform:scale(${zVal.toFixed(2)})"`;
    }

    return `
      ${bgHtml}
      <img src="${photo.url}" class="${useLivePolaroid ? POLAROID_STYLE.mediaClass : ""}" ${styleAttr} alt="${escapeHtml(photo.caption)}" loading="lazy" />
      ${useLivePolaroid ? `<div class="creative-fx-layer ${POLAROID_STYLE.overlayClass}"></div>` : ""}
    `;
  }

  function renderPhotosStage() {
    const stage = document.getElementById("photos-stage");
    if (viewMode === "retro") {
      renderRetroFilmstripMode(stage);
    } else if (viewMode === "masonry") {
      renderMasonryMode(stage);
    } else {
      renderPolaroidMode(stage);
    }
  }

  function renderRetroFilmstripMode(stage) {
    const weeksToRender = state.weeks.filter((w) => {
      if (selectedWeekId !== "all" && w.id !== selectedWeekId) return false;
      if (selectedAuthorId !== "all" && w.selectedFriendId !== selectedAuthorId) return false;
      return true;
    });

    if (weeksToRender.length === 0) {
      stage.innerHTML = renderEmptyState();
      bindPhotoCardClicks(stage);
      return;
    }

    stage.innerHTML = weeksToRender
      .map((week) => {
        const winner = getFriend(week.selectedFriendId);
        const isCurrentAndMine = week.isCurrent && currentUser.id === winner.id;
        let cardsHtml = "";

        for (let slot = 1; slot <= 5; slot++) {
          const photo = week.photos[slot - 1];
          if (photo) {
            cardsHtml += `
              <article class="retro-photo-card" data-photo-id="${photo.id}">
                <div class="retro-img-wrap">
                  ${renderPhotoVisualLayers(photo)}
                  <span class="slot-corner-tag">${photo.dateShort || `0${slot}/05`}</span>
                </div>
              </article>
            `;
          } else {
            const isNextSlot = slot === week.photos.length + 1;
            const interactiveClass = isCurrentAndMine && isNextSlot ? "interactive" : "";
            cardsHtml += `
              <div class="retro-empty-slot ${interactiveClass}" ${interactiveClass ? 'data-upload-slot="true"' : ""}>
                <span class="mono-label">0${slot}/05</span>
                ${
                  interactiveClass
                    ? `<span style="font-size:1.4rem;color:var(--accent-primary)">＋</span>`
                    : `<span class="mono-muted">·</span>`
                }
              </div>
            `;
          }
        }

        return `
          <section class="week-block">
            <div class="week-block-header">
              <div class="week-title-row">
                <h2 class="week-big-title">${week.title}</h2>
                <span class="mono-muted">${week.dateRange}</span>
              </div>
              <div class="week-author-pill">
                <span class="user-avatar-xs" style="background:${winner.color}">${winner.avatar}</span>
                <span>${winner.name}</span>
              </div>
            </div>
            <div class="retro-five-grid">
              ${cardsHtml}
            </div>
          </section>
        `;
      })
      .join("");

    bindPhotoCardClicks(stage);
  }

  function renderMasonryMode(stage) {
    const photos = getAllPhotosFiltered();
    if (photos.length === 0) {
      stage.innerHTML = renderEmptyState();
      bindPhotoCardClicks(stage);
      return;
    }

    stage.innerHTML = `
      <div class="masonry-grid">
        ${photos
          .map((photo) => {
            return `
              <article class="masonry-item" data-photo-id="${photo.id}">
                ${renderPhotoVisualLayers(photo)}
                <span class="slot-corner-tag">${photo.dateShort || `0${photo.slotNumber}/05`}</span>
              </article>
            `;
          })
          .join("")}
      </div>
    `;

    bindPhotoCardClicks(stage);
  }

  function renderPolaroidMode(stage) {
    const photos = getAllPhotosFiltered();
    if (photos.length === 0) {
      stage.innerHTML = renderEmptyState();
      bindPhotoCardClicks(stage);
      return;
    }

    stage.innerHTML = `
      <div class="polaroid-grid">
        ${photos
          .map((photo) => {
            const author = getFriend(photo.authorId);
            return `
              <article class="polaroid-card" data-photo-id="${photo.id}">
                <div class="polaroid-img-box">
                  ${renderPhotoVisualLayers(photo)}
                </div>
                <div class="polaroid-bottom-row">
                  <span>💬 ${photo.comments.length} &nbsp; ♡ ${photo.likes || 0}</span>
                  <span>${author.name} · ${photo.dateShort || `0${photo.slotNumber}/05`}</span>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;

    bindPhotoCardClicks(stage);
  }

  function renderEmptyState() {
    return `
      <div style="text-align:center;padding:3.5rem 1.25rem;border:1px dashed var(--border-strong);border-radius:var(--radius-lg)">
        <p style="font-family:var(--font-serif);font-size:1.7rem;margin-bottom:0.5rem">Sin fotos en este filtro</p>
        <button type="button" class="btn-secondary-sm" id="btn-clear-filters">Ver toda la galería</button>
      </div>
    `;
  }

  function bindPhotoCardClicks(container) {
    container.querySelectorAll("[data-photo-id]").forEach((el) => {
      el.addEventListener("click", () => openPhotoModal(el.getAttribute("data-photo-id")));
    });
    container.querySelectorAll("[data-upload-slot]").forEach((el) => {
      el.addEventListener("click", () => openUploadModal());
    });
    container.querySelector("#btn-clear-filters")?.addEventListener("click", () => {
      selectedWeekId = "all";
      selectedAuthorId = "all";
      renderAll();
    });
  }

  // =========================================================================
  // VISOR DE FOTO (DISEÑO EXACTO DEL BOCETO: FOTO + [ 💬   ♡   XX/XX ])
  // =========================================================================
  function findPhotoById(photoId) {
    for (const week of state.weeks) {
      const found = week.photos.find((p) => p.id === photoId);
      if (found) return { photo: found, week };
    }
    return null;
  }

  function applyZoomTransformToElement(imgEl, bgWideEl, zoomVal, srcUrl) {
    if (!imgEl) return;
    if (zoomVal < 1) {
      const scaleOut = 0.76 + ((zoomVal - 0.5) / 0.5) * 0.24;
      imgEl.style.objectFit = "contain";
      imgEl.style.transform = `scale(${scaleOut.toFixed(2)})`;
      imgEl.style.borderRadius = "10px";
      imgEl.style.boxShadow = "0 14px 34px rgba(0,0,0,0.55)";
      if (bgWideEl && srcUrl) {
        bgWideEl.src = srcUrl;
        bgWideEl.classList.remove("hidden");
      }
    } else {
      imgEl.style.objectFit = "cover";
      imgEl.style.transform = `scale(${zoomVal.toFixed(2)})`;
      imgEl.style.borderRadius = "0px";
      imgEl.style.boxShadow = "none";
      bgWideEl?.classList.add("hidden");
    }
  }

  function openPhotoModal(photoId) {
    const entry = findPhotoById(photoId);
    if (!entry) return;
    activeModalPhotoId = photoId;
    const { photo } = entry;
    const author = getFriend(photo.authorId);

    const imgEl = document.getElementById("modal-photo-img");
    const bgWideEl = document.getElementById("modal-bg-wide");
    const fxLayer = document.getElementById("modal-fx-layer");
    const ledStamp = document.getElementById("modal-led-stamp");
    const filmCode = document.getElementById("modal-film-code");

    imgEl.src = photo.url;
    const useLivePolaroid = photo.filter === "polaroid" && !photo.bakedFilter;
    imgEl.className = `viewer-media-fit ${useLivePolaroid ? POLAROID_STYLE.mediaClass : ""}`;
    fxLayer.className = `creative-fx-layer ${useLivePolaroid ? POLAROID_STYLE.overlayClass : ""}`;

    viewerZoom = typeof photo.zoom === "number" && !photo.bakedFilter ? photo.zoom : 1;
    applyZoomTransformToElement(imgEl, bgWideEl, viewerZoom, photo.url);

    if (useLivePolaroid && ledStamp && filmCode) {
      ledStamp.textContent = getLedDateStampString();
      ledStamp.classList.remove("hidden");
      filmCode.textContent = POLAROID_STYLE.filmCode;
    } else if (ledStamp && filmCode) {
      ledStamp.classList.add("hidden");
      filmCode.textContent = "";
    }

    const avatarEl = document.getElementById("modal-author-avatar");
    avatarEl.textContent = author.avatar;
    avatarEl.style.background = author.color;
    document.getElementById("modal-author-name").textContent = author.name;

    document.getElementById("drawer-caption-author").textContent = `${author.name}:`;
    document.getElementById("modal-photo-caption").textContent = photo.caption || "";

    document.getElementById("sketch-comments-drawer").classList.add("hidden");

    updateSketchBottomBar(photo);
    renderModalComments(photo);

    document.getElementById("photo-modal").classList.remove("hidden");
  }

  function updateSketchBottomBar(photo) {
    if (typeof photo.likes !== "number") photo.likes = 3;

    document.getElementById("modal-comments-count").textContent = `${photo.comments.length}`;

    const likeBtn = document.getElementById("btn-toggle-like");
    likeBtn.classList.toggle("liked", Boolean(photo.likedByMe));
    document.getElementById("modal-likes-count").textContent = `${photo.likes}`;

    const xxLabel = document.getElementById("modal-xx-label");
    const dateVal = photo.dateShort || "08/11";
    const slotVal = `0${photo.slotNumber}/05`;
    xxLabel.textContent = showSlotInsteadOfDate ? slotVal : dateVal;
  }

  function toggleLikeCurrentPhoto() {
    if (!activeModalPhotoId) return;
    const entry = findPhotoById(activeModalPhotoId);
    if (!entry) return;
    const { photo } = entry;

    if (typeof photo.likes !== "number") photo.likes = 3;
    photo.likedByMe = !photo.likedByMe;
    photo.likes = Math.max(0, photo.likes + (photo.likedByMe ? 1 : -1));

    saveState();
    updateSketchBottomBar(photo);
    renderPhotosStage();
  }

  function renderModalComments(photo) {
    const list = document.getElementById("modal-comments-list");

    if (photo.comments.length === 0) {
      list.innerHTML = `<p class="mono-muted" style="padding:0.5rem 0">Sin comentarios todavía. ¡Sé el primero!</p>`;
      return;
    }

    list.innerHTML = photo.comments
      .map((c) => {
        const cAuthor = getFriend(c.authorId);
        return `
          <div class="comment-item">
            <div class="comment-top">
              <strong style="color:${cAuthor.color}">${cAuthor.name}</strong>
              <span class="mono-muted">${escapeHtml(c.createdAt)}</span>
            </div>
            <p>${escapeHtml(c.text)}</p>
          </div>
        `;
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  function navigateModalPhoto(direction) {
    const photos = getAllPhotosFiltered();
    if (photos.length <= 1) return;
    const idx = photos.findIndex((p) => p.id === activeModalPhotoId);
    if (idx === -1) return;
    const nextIdx = (idx + direction + photos.length) % photos.length;
    openPhotoModal(photos[nextIdx].id);
  }

  // =========================================================================
  // CÁMARA / SUBIR FOTO CON FILTRO POLAROID + ZOOM (0.5x, 1x, 2x + SLIDER)
  // =========================================================================
  async function openUploadModal() {
    closeSidebar();
    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);

    if (currentUser.id !== winner.id) {
      showToast(`🔒 Solo ${winner.name} puede subir fotos esta semana.`);
      return;
    }

    if (currentWeek.photos.length >= 5) {
      showToast("Ya completaste las 5 fotos de hoy.");
      return;
    }

    pendingUploadBlob = null;
    pendingUploadDataUrl = "";
    pendingUploadIsBaked = false;
    isCapturedFrozen = false;
    polaroidEnabled = true;
    cameraZoom = 1.0;

    document.getElementById("capture-caption-drawer").classList.add("hidden");
    document.getElementById("input-photo-caption").value = "";

    const nextSlot = currentWeek.photos.length + 1;
    document.getElementById("upload-modal-slot-label").textContent = `0${nextSlot} / 05`;
    document.getElementById("viewfinder-date-stamp").textContent = getLedDateStampString();

    document.getElementById("upload-modal").classList.remove("hidden");
    setCameraZoom(1.0);
    updatePolaroidUI();

    // Iniciar cámara en vivo directamente o permitir tomar foto
    await startCameraDirectly();
  }

  async function startCameraDirectly() {
    stopCameraStream();
    isCapturedFrozen = false;

    const videoEl = document.getElementById("camera-live-video");
    const imgEl = document.getElementById("upload-preview-img");
    const bgWideEl = document.getElementById("viewfinder-bg-wide");
    document.getElementById("viewfinder-filter-overlay").classList.remove("hidden");
    document.getElementById("capture-caption-drawer").classList.add("hidden");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cameraFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 1600 }
          },
          audio: false
        });
        videoEl.srcObject = cameraStream;
        videoEl.classList.remove("hidden");
        imgEl.classList.add("hidden");
        bgWideEl?.classList.add("hidden");
        usingLiveCamera = true;
        updatePolaroidUI();
        setCameraZoom(cameraZoom);
        return;
      } catch (e) {
        console.warn("No se pudo iniciar cámara directa:", e);
      }
    }

    // Si no hay acceso a cámara web directa, visor limpio esperando foto
    usingLiveCamera = false;
    videoEl.classList.add("hidden");
    imgEl.classList.remove("hidden");
    imgEl.removeAttribute("src");
    updatePolaroidUI();
  }

  async function toggleOrFlipWebcam() {
    cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    await startCameraDirectly();
  }

  function stopCameraStream() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    usingLiveCamera = false;
  }

  function updatePolaroidUI() {
    const videoEl = document.getElementById("camera-live-video");
    const imgEl = document.getElementById("upload-preview-img");
    const overlayEl = document.getElementById("viewfinder-filter-overlay");
    const badgeBtn = document.getElementById("btn-toggle-polaroid");
    const tagEl = document.getElementById("camera-active-filter-tag");

    videoEl.classList.toggle(POLAROID_STYLE.mediaClass, polaroidEnabled);
    imgEl.classList.toggle(POLAROID_STYLE.mediaClass, polaroidEnabled);
    overlayEl.classList.toggle(POLAROID_STYLE.overlayClass, polaroidEnabled);
    overlayEl.classList.toggle("hidden", !polaroidEnabled || isCapturedFrozen);
    badgeBtn?.classList.toggle("active", polaroidEnabled);
    if (tagEl) tagEl.textContent = polaroidEnabled ? "POLAROID" : "ORIGINAL";
  }

  function setCameraZoom(rawZoom) {
    const clamped = Math.max(0.5, Math.min(3.0, Number(rawZoom) || 1.0));
    cameraZoom = Math.round(clamped * 20) / 20;

    if (isCapturedFrozen) {
      isCapturedFrozen = false;
      document.getElementById("capture-caption-drawer").classList.add("hidden");
      updatePolaroidUI();
    }

    // Actualizar píldoras rápidas (0.5x, 1x, 2x)
    document.querySelectorAll(".zoom-pill").forEach((pill) => {
      const pVal = Number(pill.getAttribute("data-zoom"));
      pill.classList.toggle("active", Math.abs(cameraZoom - pVal) < 0.06);
    });

    // Actualizar slider y etiqueta numérica
    const slider = document.getElementById("camera-zoom-slider");
    if (slider) slider.value = String(cameraZoom);
    const readout = document.getElementById("camera-zoom-readout");
    if (readout) {
      readout.textContent =
        cameraZoom === 0.5 ? "0.5x" : `${cameraZoom.toFixed(1).replace(".0", "")}x`;
    }

    // Intentar aplicar zoom de hardware si hay cámara activa en celular
    if (usingLiveCamera && cameraStream) {
      const track = cameraStream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === "function") {
        try {
          const caps = track.getCapabilities();
          if (caps && caps.zoom) {
            const hwZoom = Math.max(caps.zoom.min, Math.min(caps.zoom.max, cameraZoom));
            track.applyConstraints({ advanced: [{ zoom: hwZoom }] }).catch(() => {});
          }
        } catch (e) {
          // Continuar con zoom óptico en el visor
        }
      }
    }

    const activeMedia = usingLiveCamera
      ? document.getElementById("camera-live-video")
      : document.getElementById("upload-preview-img");
    const bgWideEl = document.getElementById("viewfinder-bg-wide");

    applyZoomTransformToElement(
      activeMedia,
      bgWideEl,
      cameraZoom,
      usingLiveCamera ? "" : document.getElementById("upload-preview-img").src
    );
  }

  // Renderizado en <canvas> al presionar el botón blanco de obturador
  async function handleShutterTakePhoto() {
    const flash = document.getElementById("camera-flash-overlay");
    flash.classList.add("flash-active");
    setTimeout(() => flash.classList.remove("flash-active"), 220);

    const videoEl = document.getElementById("camera-live-video");
    const imgEl = document.getElementById("upload-preview-img");
    const bgWideEl = document.getElementById("viewfinder-bg-wide");

    try {
      const canvas = document.createElement("canvas");
      const W = 1080;
      const H = 1350;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      const source = usingLiveCamera ? videoEl : imgEl;
      const srcW = usingLiveCamera ? videoEl.videoWidth || W : imgEl.naturalWidth || W;
      const srcH = usingLiveCamera ? videoEl.videoHeight || H : imgEl.naturalHeight || H;

      ctx.fillStyle = "#0b0b0e";
      ctx.fillRect(0, 0, W, H);

      const coverScale = Math.max(W / srcW, H / srcH);
      const containScale = Math.min(W / srcW, H / srcH);

      if (cameraZoom < 1) {
        // Modo 0.5x Ultra Gran Angular: fondo ambiente difuminado + toma completa sin recortar
        ctx.save();
        ctx.filter = "blur(28px) brightness(0.6) saturate(1.3)";
        const bgW = srcW * coverScale * 1.15;
        const bgH = srcH * coverScale * 1.15;
        ctx.drawImage(source, (W - bgW) / 2, (H - bgH) / 2, bgW, bgH);
        ctx.restore();

        const wideFactor = 0.78 + ((cameraZoom - 0.5) / 0.5) * 0.22;
        const drawW = srcW * containScale * wideFactor;
        const drawH = srcH * containScale * wideFactor;
        const offsetX = (W - drawW) / 2;
        const offsetY = (H - drawH) / 2;

        ctx.save();
        if (polaroidEnabled) ctx.filter = POLAROID_STYLE.canvasFilter;
        ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      } else {
        // Modo 1x a 3.0x Zoom
        const drawW = srcW * coverScale * cameraZoom;
        const drawH = srcH * coverScale * cameraZoom;
        const offsetX = (W - drawW) / 2;
        const offsetY = (H - drawH) / 2;

        ctx.save();
        if (polaroidEnabled) ctx.filter = POLAROID_STYLE.canvasFilter;
        ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      }

      // Marco Polaroid y Sello de Fecha LED si está activo
      if (polaroidEnabled) {
        const bSide = 34;
        const bBottom = 115;
        ctx.fillStyle = "#f6f2e9";
        ctx.fillRect(0, 0, W, bSide);
        ctx.fillRect(0, 0, bSide, H);
        ctx.fillRect(W - bSide, 0, bSide, H);
        ctx.fillRect(0, H - bBottom, W, bBottom);

        ctx.fillStyle = "#2b2824";
        ctx.font = "700 22px 'JetBrains Mono', monospace";
        ctx.fillText(POLAROID_STYLE.filmCode, bSide + 8, H - 46);

        ctx.save();
        ctx.font = "700 28px 'JetBrains Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillStyle = "#ff7b1c";
        ctx.shadowColor = "#ff7b1c";
        ctx.shadowBlur = 14;
        ctx.fillText(getLedDateStampString(), W - 56, H - 140);
        ctx.restore();
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      pendingUploadDataUrl = dataUrl;
      pendingUploadIsBaked = true;
      isCapturedFrozen = true;
      canvas.toBlob((blob) => {
        pendingUploadBlob = blob;
      }, "image/jpeg", 0.9);

      stopCameraStream();
      videoEl.classList.add("hidden");
      imgEl.classList.remove("hidden");
      bgWideEl?.classList.add("hidden");
      imgEl.classList.remove(POLAROID_STYLE.mediaClass);
      imgEl.style.transform = "scale(1)";
      imgEl.style.objectFit = "cover";
      document.getElementById("viewfinder-filter-overlay").classList.add("hidden");
      imgEl.src = dataUrl;
    } catch (err) {
      // Si es una imagen externa de muestra, conservamos el marco Polaroid y el zoom en vivo
      pendingUploadBlob = null;
      pendingUploadDataUrl = imgEl.src;
      pendingUploadIsBaked = false;
      isCapturedFrozen = true;
    }

    const drawer = document.getElementById("capture-caption-drawer");
    drawer.classList.remove("hidden");
    setTimeout(() => {
      document.getElementById("input-photo-caption")?.focus();
    }, 120);
  }

  async function uploadPhotoToDiscordWebhook(blob, dataUrl, metadata) {
    // Buscar el webhook específico del autor de la foto
    const author = getFriend(metadata.authorId);
    const webhookUrl = (author && author.webhookUrl ? author.webhookUrl : (state.discordWebhookUrl || "")).trim();
    if (!webhookUrl) return { url: dataUrl, synced: false };

    try {
      const waitUrl = webhookUrl.includes("?")
        ? `${webhookUrl}&wait=true`
        : `${webhookUrl}?wait=true`;

      const formData = new FormData();
      const payload = {
        username: `${author.name} // PUCHIPI CLUB`,
        content: `🎞️ **Nueva foto en ${metadata.weekTitle}**\n👤 **Autor:** ${metadata.authorName}\n📸 **Toma:** Disparo \`0${metadata.slotNumber}/05\` (${metadata.filterName})`,
        embeds: [
          {
            title: `Disparo 0${metadata.slotNumber}/05 · ${metadata.filterName}`,
            description: metadata.caption || "*Sin descripción*",
            color: parseInt((author.color || "#FF5A36").replace("#", ""), 16),
            footer: { text: `PUCHIPI CLUB · ${metadata.weekId} · ${author.name}` },
            timestamp: new Date().toISOString()
          }
        ]
      };

      if (blob) {
        formData.append("file", blob, `seis_${author.id}_${metadata.weekId}_slot0${metadata.slotNumber}.jpg`);
      } else {
        payload.embeds[0].image = { url: dataUrl };
      }

      formData.append("payload_json", JSON.stringify(payload));

      const response = await fetch(waitUrl, { method: "POST", body: formData });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      const cdnUrl = result.attachments?.[0]?.url || dataUrl;
      return { url: cdnUrl, synced: true };
    } catch (err) {
      console.warn("Error enviando al Webhook de Discord:", err);
      return { url: dataUrl, synced: false };
    }
  }

  // Notificar comentarios a Discord usando el webhook del autor de la foto
  async function notifyCommentToDiscord(photo, comment) {
    const photoAuthor = getFriend(photo.authorId);
    const commentAuthor = getFriend(comment.authorId);
    const webhookUrl = (photoAuthor && photoAuthor.webhookUrl ? photoAuthor.webhookUrl : "").trim();
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "PUCHIPI // COMENTARIOS",
          content: `💬 **${commentAuthor.name}** comentó en la foto **0${photo.slotNumber}/05** de **${photoAuthor.name}**:\n> "${comment.text}"`
        })
      });
    } catch (e) {
      console.warn("No se pudo notificar el comentario a Discord:", e);
    }
  }

  // =========================================================================
  // MODAL DE LA RULETA DEL LUNES
  // =========================================================================
  function openRouletteModal() {
    closeSidebar();
    const currentWeek = getCurrentWeek();
    const winner = getFriend(currentWeek.selectedFriendId);

    const winnerCard = document.getElementById("roulette-winner-card");
    if (winnerCard) {
      winnerCard.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.65rem">
          <span class="user-avatar-md" style="background:${winner.color}">${winner.avatar}</span>
          <div>
            <div style="font-weight:700">${winner.name}</div>
            <div class="mono-muted">${currentWeek.title} · ${currentWeek.rouletteSpunAt}</div>
          </div>
        </div>
        <span class="demo-pill">5 FOTOS</span>
      `;
    }

    const historyEl = document.getElementById("roulette-history-list");
    if (historyEl) {
      historyEl.innerHTML = state.weeks
        .map((w) => {
          const f = getFriend(w.selectedFriendId);
          return `
            <div class="history-row">
              <span><strong>${w.title}</strong></span>
              <span style="display:inline-flex;align-items:center;gap:0.35rem">
                <span class="demo-dot" style="background:${f.color}"></span>
                <span>${f.name} (${w.photos.length}/5)</span>
              </span>
            </div>
          `;
        })
        .join("");
    }

    document.getElementById("roulette-modal").classList.remove("hidden");
    drawRouletteWheel();
  }

  function drawRouletteWheel() {
    const canvas = document.getElementById("roulette-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = width / 2 - 8;

    const friends = state.friends;
    const sliceAngle = (Math.PI * 2) / friends.length;

    ctx.clearRect(0, 0, width, height);

    friends.forEach((friend, i) => {
      const startAngle = wheelAngle + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = friend.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0b0b0e";
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#0b0b0e";
      ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(friend.name.toUpperCase(), radius - 22, 5);
      ctx.restore();
    });
  }

  function spinRoulette(createNewWeek = false) {
    if (isSpinning) return;
    isSpinning = true;

    const friends = state.friends;
    const sliceAngle = (Math.PI * 2) / friends.length;
    const chosenIndex = Math.floor(Math.random() * friends.length);
    const chosenFriend = friends[chosenIndex];

    const pointerAngle = (3 * Math.PI) / 2;
    const targetSliceCenter = chosenIndex * sliceAngle + sliceAngle / 2;
    const extraSpins = 6 * Math.PI * 2;
    const startAngle = wheelAngle;
    const finalAngle =
      startAngle +
      extraSpins +
      ((pointerAngle - targetSliceCenter - (startAngle % (Math.PI * 2)) + Math.PI * 4) %
        (Math.PI * 2));

    const duration = 3100;
    const startTime = performance.now();

    function animateWheel(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      wheelAngle = startAngle + (finalAngle - startAngle) * eased;
      drawRouletteWheel();

      if (progress < 1) {
        requestAnimationFrame(animateWheel);
      } else {
        isSpinning = false;
        applyRouletteWinner(chosenFriend, createNewWeek);
      }
    }

    requestAnimationFrame(animateWheel);
  }

  // Notificar sorteo de la ruleta a Discord a través del Webhook de sistema
  async function notifyRouletteWinnerToDiscord(winner, week) {
    const sysWebhook = (window.SEIS_CONFIG?.systemWebhookUrl || "").trim();
    if (!sysWebhook) return;

    try {
      await fetch(sysWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "PUCHIPI // RULETA DEL LUNES",
          content: `🎡 **¡Sorteo Semanal Realizado!**\n👑 **Ganador de la semana:** **${winner.name}** (\`${winner.handle}\`)\n📅 **${week.title}** (${week.dateRange})\n✨ ${winner.name} tiene derecho a subir **5 fotos exclusivas** durante su turno.`
        })
      });
    } catch (e) {
      console.warn("No se pudo notificar la ruleta a Discord:", e);
    }
  }

  function applyRouletteWinner(winner, createNewWeek) {
    const nowStr = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const todayShort = getTodayShortDate();
    let affectedWeek = null;

    if (createNewWeek) {
      state.weeks.forEach((w) => (w.isCurrent = false));
      const nextWeekNum = (state.weeks[0]?.weekNumber || 45) + 1;
      const newWeek = {
        id: `2026-W${nextWeekNum}`,
        weekNumber: nextWeekNum,
        title: `Semana ${nextWeekNum}`,
        dateRange: `${todayShort} — Dom`,
        year: 2026,
        selectedFriendId: winner.id,
        rouletteSpunAt: `Lunes · ${nowStr}`,
        themeNote: `Turno sorteado para ${winner.name}`,
        isCurrent: true,
        photos: []
      };
      state.weeks.unshift(newWeek);
      selectedWeekId = "all";
      affectedWeek = newWeek;
    } else {
      const currentWeek = getCurrentWeek();
      currentWeek.selectedFriendId = winner.id;
      currentWeek.rouletteSpunAt = `Lunes · ${nowStr}`;
      affectedWeek = currentWeek;
    }

    saveState();
    openRouletteModal();
    renderAll();
    renderDemoLoginPills(); // Actualizar el banner de la pantalla de login también
    showToast(`🎡 ¡Le tocó a ${winner.name}! Tiene 5 fotos hoy.`);

    if (affectedWeek) {
      notifyRouletteWinnerToDiscord(winner, affectedWeek);
    }
  }

  // =========================================================================
  // EVENTOS, ZOOM CON PELLIZCO (PINCH) Y RUEDA DE MOUSE
  // =========================================================================
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast-msg";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function bindEvents() {
    // Teclado PIN
    document.querySelectorAll(".pin-keypad [data-key]").forEach((btn) => {
      btn.addEventListener("click", () => handlePinDigit(btn.getAttribute("data-key")));
    });
    document.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
      pinBuffer = "";
      updatePinDotsUI(false);
    });
    document.querySelector('[data-action="backspace"]')?.addEventListener("click", () => {
      pinBuffer = pinBuffer.slice(0, -1);
      updatePinDotsUI(false);
    });

    // Teclado físico
    window.addEventListener("keydown", (e) => {
      const loginVisible = !document.getElementById("login-screen").classList.contains("hidden");
      if (loginVisible) {
        if (/^[0-9]$/.test(e.key)) handlePinDigit(e.key);
        else if (e.key === "Backspace") {
          pinBuffer = pinBuffer.slice(0, -1);
          updatePinDotsUI(false);
        } else if (e.key === "Escape") {
          pinBuffer = "";
          updatePinDotsUI(false);
        }
        return;
      }

      if (e.key === "Escape") {
        closeSidebar();
        stopCameraStream();
        document.getElementById("photo-modal").classList.add("hidden");
        document.getElementById("roulette-modal").classList.add("hidden");
        document.getElementById("upload-modal").classList.add("hidden");
      }

      const photoModalOpen = !document.getElementById("photo-modal").classList.contains("hidden");
      if (photoModalOpen) {
        if (e.key === "ArrowLeft") navigateModalPhoto(-1);
        else if (e.key === "ArrowRight") navigateModalPhoto(1);
      }
    });

    // Botón de 3 rayas (Hamburger) y cierre de Sidebar
    document.getElementById("btn-open-sidebar")?.addEventListener("click", openSidebar);
    document.getElementById("btn-close-sidebar")?.addEventListener("click", closeSidebar);
    document.getElementById("sidebar-backdrop")?.addEventListener("click", closeSidebar);
    document.getElementById("btn-avatar-logout")?.addEventListener("click", logout);

    // Selector de los 3 modos de vista en la galería
    document.querySelectorAll(".gallery-view-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewMode = btn.getAttribute("data-view");
        renderGalleryViewBar();
        renderPhotosStage();
      });
    });

    document.getElementById("btn-reset-gallery")?.addEventListener("click", () => {
      selectedWeekId = "all";
      selectedAuthorId = "all";
      renderAll();
    });

    // Botones de subida y ruleta
    document.getElementById("btn-sidebar-upload")?.addEventListener("click", openUploadModal);
    document.getElementById("btn-topbar-upload")?.addEventListener("click", openUploadModal);
    document.getElementById("btn-fab-upload")?.addEventListener("click", openUploadModal);
    document.getElementById("btn-sidebar-roulette")?.addEventListener("click", openRouletteModal);

    document.getElementById("btn-close-roulette-modal")?.addEventListener("click", () => {
      document.getElementById("roulette-modal").classList.add("hidden");
    });
    document.getElementById("btn-spin-center")?.addEventListener("click", () => spinRoulette(false));
    document.getElementById("btn-spin-roulette")?.addEventListener("click", () => spinRoulette(false));
    document.getElementById("btn-new-week-roulette")?.addEventListener("click", () => spinRoulette(true));

    // =====================================================================
    // EVENTOS DEL VISOR DE FOTO
    // =====================================================================
    const photoModal = document.getElementById("photo-modal");
    photoModal?.addEventListener("click", (e) => {
      if (e.target === photoModal) photoModal.classList.add("hidden");
    });

    document.getElementById("btn-close-photo-modal")?.addEventListener("click", () => {
      photoModal.classList.add("hidden");
    });

    document.getElementById("btn-modal-prev")?.addEventListener("click", () => navigateModalPhoto(-1));
    document.getElementById("btn-modal-next")?.addEventListener("click", () => navigateModalPhoto(1));

    document.getElementById("btn-toggle-comments")?.addEventListener("click", () => {
      const drawer = document.getElementById("sketch-comments-drawer");
      drawer.classList.toggle("hidden");
      if (!drawer.classList.contains("hidden")) {
        document.getElementById("input-comment-text")?.focus();
      }
    });

    document.getElementById("btn-close-comments-drawer")?.addEventListener("click", () => {
      document.getElementById("sketch-comments-drawer").classList.add("hidden");
    });

    document.getElementById("btn-toggle-like")?.addEventListener("click", toggleLikeCurrentPhoto);

    let lastTapTime = 0;
    document.getElementById("modal-photo-img")?.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTapTime < 300) toggleLikeCurrentPhoto();
      lastTapTime = now;
    });

    document.getElementById("btn-toggle-date-format")?.addEventListener("click", () => {
      showSlotInsteadOfDate = !showSlotInsteadOfDate;
      const entry = findPhotoById(activeModalPhotoId);
      if (entry) updateSketchBottomBar(entry.photo);
    });

    document.getElementById("form-add-comment")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("input-comment-text");
      const text = input.value.trim();
      if (!text || !activeModalPhotoId) return;

      const entry = findPhotoById(activeModalPhotoId);
      if (!entry) return;

      const nowTime = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const newComment = {
        id: "cm-" + Date.now(),
        authorId: currentUser.id,
        text,
        createdAt: nowTime
      };
      entry.photo.comments.push(newComment);

      input.value = "";
      saveState();
      updateSketchBottomBar(entry.photo);
      renderModalComments(entry.photo);
      renderPhotosStage();

      // Notificar a Discord en segundo plano
      notifyCommentToDiscord(entry.photo, newComment);
    });

    // =====================================================================
    // EVENTOS DE LA CÁMARA: ZOOM (0.5x, 1x, 2x + SLIDER + PELLIZCO) + POLAROID
    // =====================================================================
    const uploadModal = document.getElementById("upload-modal");
    uploadModal?.addEventListener("click", (e) => {
      if (e.target === uploadModal) {
        stopCameraStream();
        uploadModal.classList.add("hidden");
      }
    });

    document.getElementById("btn-close-upload-modal")?.addEventListener("click", () => {
      stopCameraStream();
      uploadModal.classList.add("hidden");
    });

    // Botones rápidos de lente: 0.5x, 1x, 2x
    document.querySelectorAll(".zoom-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        setCameraZoom(Number(pill.getAttribute("data-zoom")));
      });
    });

    // Slider continuo de Zoom (0.5x a 3.0x)
    document.getElementById("camera-zoom-slider")?.addEventListener("input", (e) => {
      setCameraZoom(Number(e.target.value));
    });

    // Rueda de mouse en el visor de cámara para hacer zoom suave en PC
    const cameraViewfinder = document.getElementById("camera-viewfinder");
    cameraViewfinder?.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setCameraZoom(cameraZoom + delta);
      },
      { passive: false }
    );

    // Pellizcar con 2 dedos (Pinch-to-Zoom) en el visor de cámara en celular
    let initialPinchDist = null;
    let initialPinchZoom = 1.0;

    cameraViewfinder?.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          initialPinchDist = Math.hypot(dx, dy);
          initialPinchZoom = cameraZoom;
        }
      },
      { passive: true }
    );

    cameraViewfinder?.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 2 && initialPinchDist) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const ratio = dist / initialPinchDist;
          setCameraZoom(initialPinchZoom * ratio);
        }
      },
      { passive: true }
    );

    cameraViewfinder?.addEventListener(
      "touchend",
      () => {
        initialPinchDist = null;
      },
      { passive: true }
    );

    // Botón para activar/desactivar el marco Polaroid
    document.getElementById("btn-toggle-polaroid")?.addEventListener("click", () => {
      polaroidEnabled = !polaroidEnabled;
      if (isCapturedFrozen) {
        isCapturedFrozen = false;
        document.getElementById("capture-caption-drawer").classList.add("hidden");
        setCameraZoom(cameraZoom);
      }
      updatePolaroidUI();
    });

    document.getElementById("btn-shutter-capture")?.addEventListener("click", handleShutterTakePhoto);

    document.getElementById("btn-retake-photo")?.addEventListener("click", () => {
      document.getElementById("capture-caption-drawer").classList.add("hidden");
      startCameraDirectly();
    });

    document.getElementById("btn-toggle-webcam")?.addEventListener("click", toggleOrFlipWebcam);

    const fileInput = document.getElementById("input-photo-file");
    const nativeCamInput = document.getElementById("input-native-camera");

    document.getElementById("btn-pick-file")?.addEventListener("click", () => fileInput?.click());
    document.getElementById("btn-open-native-camera")?.addEventListener("click", () => nativeCamInput?.click());

    function handleFileSelected(file) {
      if (!file) return;
      stopCameraStream();
      isCapturedFrozen = false;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const videoEl = document.getElementById("camera-live-video");
        const imgEl = document.getElementById("upload-preview-img");
        videoEl.classList.add("hidden");
        imgEl.classList.remove("hidden");
        imgEl.src = ev.target.result;
        updatePolaroidUI();
        setCameraZoom(1.0); // La foto ya viene con la perspectiva nativa del lente
        document.getElementById("capture-caption-drawer").classList.add("hidden");
        showToast("📸 Foto capturada con lente real. ¡Puedes disparar el botón blanco para revelarla en Polaroid!");
      };
      reader.readAsDataURL(file);
    }

    fileInput?.addEventListener("change", (e) => handleFileSelected(e.target.files?.[0]));
    nativeCamInput?.addEventListener("change", (e) => handleFileSelected(e.target.files?.[0]));

    document.getElementById("form-upload-photo")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!pendingUploadDataUrl) {
        await handleShutterTakePhoto();
      }

      const currentWeek = getCurrentWeek();
      if (currentWeek.photos.length >= 5) {
        showToast("Ya se subieron las 5 fotos de esta semana.");
        return;
      }

      const submitBtn = document.getElementById("btn-submit-upload");
      submitBtn.disabled = true;
      submitBtn.textContent = "Subiendo...";

      const slotNumber = currentWeek.photos.length + 1;
      const caption = document.getElementById("input-photo-caption").value.trim();
      const nowTime = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const filterLabel = `${polaroidEnabled ? "POLAROID" : "ORIGINAL"} · ${cameraZoom}x`;

      const uploadRes = await uploadPhotoToDiscordWebhook(pendingUploadBlob, pendingUploadDataUrl, {
        weekId: currentWeek.id,
        weekTitle: currentWeek.title,
        slotNumber,
        authorId: currentUser.id,
        authorName: currentUser.name,
        caption,
        filterName: filterLabel
      });

      currentWeek.photos.push({
        id: `ph-${currentWeek.weekNumber}-${Date.now()}`,
        weekId: currentWeek.id,
        authorId: currentUser.id,
        slotNumber,
        dateShort: getTodayShortDate(),
        dayLabel: `Hoy · ${nowTime}`,
        caption,
        location: filterLabel,
        aspect: "portrait",
        filter: polaroidEnabled ? "polaroid" : "none",
        zoom: cameraZoom,
        bakedFilter: pendingUploadIsBaked,
        url: uploadRes.url,
        discordSynced: uploadRes.synced,
        likes: 1,
        likedByMe: true,
        comments: []
      });

      saveState();
      submitBtn.disabled = false;
      submitBtn.textContent = "Subir foto";
      stopCameraStream();
      document.getElementById("upload-modal").classList.add("hidden");

      renderAll();
      showToast(`✨ Foto 0${slotNumber}/05 publicada (${filterLabel})`);
    });

    // Gestos táctiles Swipe en Sidebar y Visor de Fotos
    let touchStartX = 0;
    let touchStartY = 0;

    document.getElementById("sidebar-drawer")?.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    document.getElementById("sidebar-drawer")?.addEventListener(
      "touchend",
      (e) => {
        if (e.changedTouches[0].screenX - touchStartX < -55) closeSidebar();
      },
      { passive: true }
    );

    const photoBox = document.getElementById("sketch-photo-box");
    photoBox?.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      },
      { passive: true }
    );
    photoBox?.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].screenX - touchStartX;
        const dy = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          navigateModalPhoto(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  // Comprobar si es lunes y si requiere rotar automáticamente la ruleta semanal
  function checkMondayAutoRoulette() {
    try {
      const now = new Date();
      // 1 = Lunes en JavaScript (0 = Domingo)
      const isMonday = now.getDay() === 1;
      const todayISO = now.toISOString().slice(0, 10);
      const lastCheckKey = "seis_retro_last_monday_spin";
      const lastSpunDate = localStorage.getItem(lastCheckKey);

      // Si es hoy, marcarlo como ya registrado para no sobreescribir el turno asignado
      if (isMonday && !lastSpunDate) {
        localStorage.setItem(lastCheckKey, todayISO);
        return;
      }

      if (isMonday && lastSpunDate !== todayISO) {
        // Elegir aleatoriamente a uno de los 6 amigos
        const randomFriend = state.friends[Math.floor(Math.random() * state.friends.length)];
        applyRouletteWinner(randomFriend, true);
        localStorage.setItem(lastCheckKey, todayISO);
        console.log("Ruleta automática de lunes activada para:", randomFriend.name);
      }
    } catch (e) {
      console.warn("Error en auto-rotación de lunes:", e);
    }
  }

  function init() {
    checkMondayAutoRoulette();
    renderDemoLoginPills();
    bindEvents();

    const savedUserId = sessionStorage.getItem(SESSION_KEY);
    if (savedUserId) {
      loginAsFriend(savedUserId);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
