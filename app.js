(function () {
  "use strict";

  const STORAGE_KEY = "pomodoro_plus_v1";
  const CLOUD_BACKUP_KEY = "pomodoro_plus_cloud_backup_v1";
  const MAX_MINUTES_PER_SEGMENT = 500;
  const CIRCLE_LENGTH = 490;
  const PHASE_META = {
    focus: { label: "Focus", className: "phase-focus" },
    shortBreak: { label: "Short Break", className: "phase-shortBreak" },
    longBreak: { label: "Long Break", className: "phase-longBreak" }
  };

  const defaults = {
    version: 1,
    settings: {
      theme: "auto",
      fontFamily: "inter",
      highContrast: false,
      soundEnabled: true,
      soundVolume: 0.6,
      alarmTone: "chime",
      focusMusicMode: "off",
      focusMusicVolume: 0.22,
      notificationEnabled: false,
      tickSound: false,
      autoStartBreak: false,
      autoStartFocus: false,
      autoCheckTaskOnFocusEnd: false,
      showSeconds: true,
      keepScreenAwake: false,
      cloudBackupEnabled: false,
      miniPos: { x: null, y: null }
    },
    profiles: [
      {
        id: "classic",
        name: "Classic 25/5",
        focusMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
        cyclesBeforeLongBreak: 4
      }
    ],
    activeProfileId: "classic",
    timerState: {
      phase: "focus",
      remainingSec: 25 * 60,
      isRunning: false,
      completedFocusInCycle: 0,
      sessionTaskId: null,
      lastTickEpochMs: 0,
      segmentTotalSec: 25 * 60,
      startedAt: 0
    },
    tasks: [],
    history: []
  };

  const state = loadState();
  let tickHandle = null;
  let analyticsRangeDays = 7;
  let selectedTaskId = null;
  let activeDrag = null;
  const pip = {
    win: null,
    isDocumentPiP: false,
    display: null,
    phase: null,
    startPause: null,
    skip: null,
    close: null
  };
  const music = {
    ctx: null,
    gain: null,
    mode: "off",
    nodes: []
  };

  const el = {
    body: document.body,
    timerWrap: document.querySelector(".timer-wrap"),
    timerDisplay: document.getElementById("timerDisplay"),
    phaseBadge: document.getElementById("phaseBadge"),
    profileSelect: document.getElementById("profileSelect"),
    ringProgress: document.getElementById("ringProgress"),
    startPauseBtn: document.getElementById("startPauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    skipBtn: document.getElementById("skipBtn"),
    notifyBtn: document.getElementById("notifyBtn"),
    soundEnabled: document.getElementById("soundEnabled"),
    showSeconds: document.getElementById("showSeconds"),
    autoStartFocus: document.getElementById("autoStartFocus"),
    autoStartBreak: document.getElementById("autoStartBreak"),
    soundVolume: document.getElementById("soundVolume"),
    alarmTone: document.getElementById("alarmTone"),
    focusMusicMode: document.getElementById("focusMusicMode"),
    focusMusicVolume: document.getElementById("focusMusicVolume"),
    autoCheckTaskOnFocusEnd: document.getElementById("autoCheckTaskOnFocusEnd"),
    cloudBackupEnabled: document.getElementById("cloudBackupEnabled"),
    profileName: document.getElementById("profileName"),
    focusMin: document.getElementById("focusMin"),
    shortBreakMin: document.getElementById("shortBreakMin"),
    longBreakMin: document.getElementById("longBreakMin"),
    focusError: document.getElementById("focusError"),
    shortBreakError: document.getElementById("shortBreakError"),
    longBreakError: document.getElementById("longBreakError"),
    cyclesBeforeLongBreak: document.getElementById("cyclesBeforeLongBreak"),
    saveProfileBtn: document.getElementById("saveProfileBtn"),
    newProfileBtn: document.getElementById("newProfileBtn"),
    deleteProfileBtn: document.getElementById("deleteProfileBtn"),
    taskInput: document.getElementById("taskInput"),
    addTaskBtn: document.getElementById("addTaskBtn"),
    taskList: document.getElementById("taskList"),
    chips: Array.from(document.querySelectorAll(".chip")),
    todayMinutes: document.getElementById("todayMinutes"),
    sessionCount: document.getElementById("sessionCount"),
    streakCount: document.getElementById("streakCount"),
    completionRatio: document.getElementById("completionRatio"),
    longestStreakCount: document.getElementById("longestStreakCount"),
    rewardTier: document.getElementById("rewardTier"),
    weeklyGoalProgress: document.getElementById("weeklyGoalProgress"),
    topTaskLabel: document.getElementById("topTaskLabel"),
    taskBreakdown: document.getElementById("taskBreakdown"),
    exportDayCsvBtn: document.getElementById("exportDayCsvBtn"),
    exportDayXlsxBtn: document.getElementById("exportDayXlsxBtn"),
    exportWeekCsvBtn: document.getElementById("exportWeekCsvBtn"),
    exportWeekXlsxBtn: document.getElementById("exportWeekXlsxBtn"),
    exportMonthCsvBtn: document.getElementById("exportMonthCsvBtn"),
    exportMonthXlsxBtn: document.getElementById("exportMonthXlsxBtn"),
    backupNowBtn: document.getElementById("backupNowBtn"),
    restoreBackupBtn: document.getElementById("restoreBackupBtn"),
    weeklyChart: document.getElementById("weeklyChart"),
    heatmap: document.getElementById("heatmap"),
    miniToggle: document.getElementById("miniToggle"),
    pipToggle: document.getElementById("pipToggle"),
    miniTimer: document.getElementById("miniTimer"),
    miniPhase: document.getElementById("miniPhase"),
    miniDisplay: document.getElementById("miniDisplay"),
    miniClose: document.getElementById("miniClose"),
    miniStartPause: document.getElementById("miniStartPause"),
    miniSkip: document.getElementById("miniSkip"),
    toastRegion: document.getElementById("toastRegion"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    themeSelect: document.getElementById("themeSelect"),
    fontSelect: document.getElementById("fontSelect"),
    highContrastToggle: document.getElementById("highContrastToggle"),
    closeSettings: document.getElementById("closeSettings"),
    aboutBtn: document.getElementById("aboutBtn"),
    aboutDialog: document.getElementById("aboutDialog"),
    closeAbout: document.getElementById("closeAbout"),
    shortcutsBtn: document.getElementById("shortcutsBtn"),
    shortcutsDialog: document.getElementById("shortcutsDialog"),
    closeShortcuts: document.getElementById("closeShortcuts")
  };

  init();

  function init() {
    applyEmbedMode();
    syncTimerToProfileIfInvalid();
    saveState();
    bindEvents();
    updatePiPButton();
    renderProfiles();
    renderSettings();
    renderTasks();
    renderTimer();
    renderAnalytics();
    restoreMiniPosition();
    syncFocusMusic();
    if (state.timerState.isRunning) startTicker();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(defaults);
      const parsed = JSON.parse(raw);
      return migrateState(parsed);
    } catch (error) {
      return deepClone(defaults);
    }
  }

  function migrateState(input) {
    const migrated = deepClone(defaults);
    if (!input || typeof input !== "object") return migrated;
    migrated.settings = { ...migrated.settings, ...(input.settings || {}) };
    migrated.profiles = Array.isArray(input.profiles) && input.profiles.length
      ? input.profiles.filter(isValidProfile)
      : migrated.profiles;
    migrated.activeProfileId = input.activeProfileId || migrated.profiles[0].id;
    migrated.timerState = { ...migrated.timerState, ...(input.timerState || {}) };
    migrated.tasks = Array.isArray(input.tasks) ? input.tasks.map(sanitizeTask) : [];
    migrated.history = Array.isArray(input.history) ? input.history.filter(isValidHistory) : [];
    migrated.version = defaults.version;
    if (!migrated.profiles.find((p) => p.id === migrated.activeProfileId)) {
      migrated.activeProfileId = migrated.profiles[0].id;
    }
    return migrated;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (state.settings.cloudBackupEnabled) writeCloudBackup();
    } catch (error) {
      toast("Storage full. Running in memory until space is available.");
    }
  }

  function bindEvents() {
    el.startPauseBtn.addEventListener("click", toggleStartPause);
    el.resetBtn.addEventListener("click", resetCurrentSegment);
    el.skipBtn.addEventListener("click", () => finishSegment(false));
    el.notifyBtn.addEventListener("click", requestNotifications);
    el.soundEnabled.addEventListener("change", () => setSetting("soundEnabled", el.soundEnabled.checked));
    el.showSeconds.addEventListener("change", () => {
      setSetting("showSeconds", el.showSeconds.checked);
      renderTimer();
    });
    el.autoStartFocus.addEventListener("change", () => setSetting("autoStartFocus", el.autoStartFocus.checked));
    el.autoStartBreak.addEventListener("change", () => setSetting("autoStartBreak", el.autoStartBreak.checked));
    el.soundVolume.addEventListener("input", () => setSetting("soundVolume", Number(el.soundVolume.value)));
    el.alarmTone.addEventListener("change", () => {
      setSetting("alarmTone", el.alarmTone.value);
      if (state.settings.soundEnabled) playAlarm(state.settings.soundVolume);
    });
    el.focusMusicMode.addEventListener("change", () => {
      setSetting("focusMusicMode", el.focusMusicMode.value);
      syncFocusMusic();
    });
    el.focusMusicVolume.addEventListener("input", () => {
      setSetting("focusMusicVolume", Number(el.focusMusicVolume.value));
      syncFocusMusic();
    });
    el.autoCheckTaskOnFocusEnd.addEventListener("change", () => setSetting("autoCheckTaskOnFocusEnd", el.autoCheckTaskOnFocusEnd.checked));
    el.cloudBackupEnabled.addEventListener("change", () => {
      setSetting("cloudBackupEnabled", el.cloudBackupEnabled.checked);
      if (el.cloudBackupEnabled.checked) {
        writeCloudBackup();
        toast("Cloud backup mirror enabled.");
      } else {
        toast("Cloud backup mirror disabled.");
      }
    });
    el.focusMin.addEventListener("input", () => validateTimeCapField("focus", Number(el.focusMin.value)));
    el.shortBreakMin.addEventListener("input", () => validateTimeCapField("shortBreak", Number(el.shortBreakMin.value)));
    el.longBreakMin.addEventListener("input", () => validateTimeCapField("longBreak", Number(el.longBreakMin.value)));

    el.profileSelect.addEventListener("change", () => {
      state.activeProfileId = el.profileSelect.value;
      applyProfileToForm();
      resetCurrentSegment();
      saveState();
    });
    el.saveProfileBtn.addEventListener("click", saveProfileFromForm);
    el.newProfileBtn.addEventListener("click", newProfile);
    el.deleteProfileBtn.addEventListener("click", deleteProfile);

    el.addTaskBtn.addEventListener("click", addTask);
    el.taskInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addTask();
    });

    el.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        analyticsRangeDays = Number(chip.dataset.range || "7");
        el.chips.forEach((n) => n.classList.remove("active"));
        chip.classList.add("active");
        renderAnalytics();
      });
    });
    el.exportDayCsvBtn.addEventListener("click", () => exportAnalyticsCsv(1, "day"));
    el.exportDayXlsxBtn.addEventListener("click", () => exportAnalyticsXlsx(1, "day"));
    el.exportWeekCsvBtn.addEventListener("click", () => exportAnalyticsCsv(7, "week"));
    el.exportWeekXlsxBtn.addEventListener("click", () => exportAnalyticsXlsx(7, "week"));
    el.exportMonthCsvBtn.addEventListener("click", () => exportAnalyticsCsv(30, "month"));
    el.exportMonthXlsxBtn.addEventListener("click", () => exportAnalyticsXlsx(30, "month"));
    el.backupNowBtn.addEventListener("click", () => {
      writeCloudBackup();
      toast("Backup saved.");
    });
    el.restoreBackupBtn.addEventListener("click", restoreFromCloudBackup);

    el.miniToggle.addEventListener("click", toggleMiniTimer);
    el.pipToggle.addEventListener("click", togglePiPWindow);
    el.miniClose.addEventListener("click", closeMiniTimer);
    el.miniStartPause.addEventListener("click", toggleStartPause);
    el.miniSkip.addEventListener("click", () => finishSegment(false));

    el.miniTimer.addEventListener("pointerdown", onMiniPointerDown);
    window.addEventListener("pointermove", onMiniPointerMove);
    window.addEventListener("pointerup", onMiniPointerUp);
    window.addEventListener("resize", clampMiniToViewport);

    el.settingsBtn.addEventListener("click", () => el.settingsDialog.showModal());
    el.closeSettings.addEventListener("click", () => el.settingsDialog.close());
    el.themeSelect.addEventListener("change", () => {
      setSetting("theme", el.themeSelect.value);
      applyThemeAndA11y();
      toast("Theme updated.");
    });
    el.fontSelect.addEventListener("change", () => {
      setSetting("fontFamily", el.fontSelect.value);
      applyThemeAndA11y();
      toast("Font updated.");
    });
    el.highContrastToggle.addEventListener("change", () => {
      setSetting("highContrast", el.highContrastToggle.checked);
      applyThemeAndA11y();
      toast(`High contrast ${el.highContrastToggle.checked ? "enabled" : "disabled"}.`);
    });
    el.aboutBtn.addEventListener("click", () => el.aboutDialog.showModal());
    el.closeAbout.addEventListener("click", () => el.aboutDialog.close());
    el.shortcutsBtn.addEventListener("click", () => el.shortcutsDialog.showModal());
    el.closeShortcuts.addEventListener("click", () => el.shortcutsDialog.close());

    document.addEventListener("keydown", handleShortcuts);
    window.addEventListener("storage", onExternalStorageUpdate);
  }

  function handleShortcuts(event) {
    if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) {
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      toggleStartPause();
    } else if (event.key.toLowerCase() === "r") {
      resetCurrentSegment();
    } else if (event.key.toLowerCase() === "s") {
      finishSegment(false);
    } else if (event.key.toLowerCase() === "m") {
      toggleMiniTimer();
    } else if (event.key.toLowerCase() === "t") {
      el.taskInput.focus();
    } else if (event.key === "?") {
      el.shortcutsDialog.showModal();
    }
  }

  function onExternalStorageUpdate(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = migrateState(JSON.parse(event.newValue));
      Object.assign(state, incoming);
      renderProfiles();
      renderSettings();
      renderTasks();
      renderTimer();
      renderAnalytics();
      syncFocusMusic();
      if (state.timerState.isRunning && !tickHandle) startTicker();
    } catch (error) {
      toast("Detected invalid sync data from another tab.");
    }
  }

  function requestNotifications() {
    if (!("Notification" in window)) {
      toast("Notifications are not supported in this browser.");
      return;
    }
    Notification.requestPermission().then((permission) => {
      const enabled = permission === "granted";
      setSetting("notificationEnabled", enabled);
      toast(enabled ? "Notifications enabled." : "Notifications not enabled.");
    });
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    saveState();
    if (key === "focusMusicMode" || key === "focusMusicVolume") syncFocusMusic();
  }

  function getActiveProfile() {
    return state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  }

  function syncTimerToProfileIfInvalid() {
    const profile = getActiveProfile();
    if (!["focus", "shortBreak", "longBreak"].includes(state.timerState.phase)) {
      state.timerState.phase = "focus";
    }
    if (!Number.isFinite(state.timerState.remainingSec) || state.timerState.remainingSec <= 0) {
      state.timerState.remainingSec = profile.focusMin * 60;
      state.timerState.segmentTotalSec = profile.focusMin * 60;
      state.timerState.phase = "focus";
    }
    if (!Number.isFinite(state.timerState.segmentTotalSec) || state.timerState.segmentTotalSec <= 0) {
      state.timerState.segmentTotalSec = phaseDurationSec(state.timerState.phase, profile);
    }
    const completedFocusSessions = state.history.some((h) => h.phase === "focus" && h.completed);
    if (state.timerState.phase === "longBreak" && state.timerState.completedFocusInCycle === 0 && !completedFocusSessions) {
      state.timerState.phase = "focus";
      state.timerState.segmentTotalSec = phaseDurationSec("focus", profile);
      state.timerState.remainingSec = state.timerState.segmentTotalSec;
      state.timerState.isRunning = false;
    }
  }

  function renderProfiles() {
    const options = state.profiles
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
      .join("");
    el.profileSelect.innerHTML = options;
    el.profileSelect.value = state.activeProfileId;
    applyProfileToForm();
  }

  function applyProfileToForm() {
    const p = getActiveProfile();
    el.profileName.value = p.name;
    el.focusMin.value = String(p.focusMin);
    el.shortBreakMin.value = String(p.shortBreakMin);
    el.longBreakMin.value = String(p.longBreakMin);
    el.cyclesBeforeLongBreak.value = String(p.cyclesBeforeLongBreak);
  }

  function saveProfileFromForm() {
    clearTimeErrors();
    const profile = {
      id: state.activeProfileId,
      name: el.profileName.value.trim() || "Custom Profile",
      focusMin: Number(el.focusMin.value),
      shortBreakMin: Number(el.shortBreakMin.value),
      longBreakMin: Number(el.longBreakMin.value),
      cyclesBeforeLongBreak: Number(el.cyclesBeforeLongBreak.value)
    };
    const invalidKey = overCapField(profile);
    if (invalidKey) {
      showTimeError(invalidKey);
      toast("Profile exceeds max allowed segment time.");
      return;
    }
    if (!isValidProfile(profile)) {
      toast("Profile values are invalid.");
      return;
    }
    state.profiles = state.profiles.map((p) => (p.id === profile.id ? profile : p));
    renderProfiles();
    resetCurrentSegment();
    saveState();
    toast("Profile saved.");
  }

  function newProfile() {
    const id = `p_${Date.now()}`;
    const source = getActiveProfile();
    const profileIndex = state.profiles.length + 1;
    const created = {
      ...source,
      id,
      name: `New Profile ${profileIndex}`
    };
    state.profiles.push(created);
    state.activeProfileId = id;
    renderProfiles();
    resetCurrentSegment();
    saveState();
    toast("New profile created.");
  }

  function deleteProfile() {
    if (state.profiles.length <= 1) {
      toast("At least one profile is required.");
      return;
    }
    state.profiles = state.profiles.filter((p) => p.id !== state.activeProfileId);
    state.activeProfileId = state.profiles[0].id;
    renderProfiles();
    resetCurrentSegment();
    saveState();
    toast("Profile deleted.");
  }

  function renderSettings() {
    applyThemeAndA11y();
    el.soundEnabled.checked = !!state.settings.soundEnabled;
    el.showSeconds.checked = !!state.settings.showSeconds;
    el.autoStartFocus.checked = !!state.settings.autoStartFocus;
    el.autoStartBreak.checked = !!state.settings.autoStartBreak;
    el.autoCheckTaskOnFocusEnd.checked = !!state.settings.autoCheckTaskOnFocusEnd;
    el.cloudBackupEnabled.checked = !!state.settings.cloudBackupEnabled;
    el.soundVolume.value = String(state.settings.soundVolume ?? 0.6);
    el.alarmTone.value = state.settings.alarmTone || "chime";
    el.focusMusicMode.value = state.settings.focusMusicMode || "off";
    el.focusMusicVolume.value = String(state.settings.focusMusicVolume ?? 0.22);
    el.themeSelect.value = state.settings.theme || "auto";
    el.fontSelect.value = state.settings.fontFamily || "inter";
    el.highContrastToggle.checked = !!state.settings.highContrast;
  }

  function phaseDurationSec(phase, profile) {
    const maxSec = MAX_MINUTES_PER_SEGMENT * 60;
    if (phase === "focus") return Math.min(maxSec, profile.focusMin * 60);
    if (phase === "shortBreak") return Math.min(maxSec, profile.shortBreakMin * 60);
    return Math.min(maxSec, profile.longBreakMin * 60);
  }

  function toggleStartPause() {
    state.timerState.isRunning = !state.timerState.isRunning;
    if (state.timerState.isRunning) {
      state.timerState.lastTickEpochMs = Date.now();
      if (!state.timerState.startedAt) state.timerState.startedAt = Date.now();
      startTicker();
    } else {
      stopTicker();
    }
    saveState();
    renderTimer();
    syncFocusMusic();
  }

  function startTicker() {
    if (tickHandle) return;
    tickHandle = window.setInterval(onTick, 250);
  }

  function stopTicker() {
    if (!tickHandle) return;
    window.clearInterval(tickHandle);
    tickHandle = null;
  }

  function onTick() {
    if (!state.timerState.isRunning) return;
    const now = Date.now();
    const elapsedSec = Math.floor((now - state.timerState.lastTickEpochMs) / 1000);
    if (elapsedSec <= 0) return;
    state.timerState.lastTickEpochMs += elapsedSec * 1000;
    state.timerState.remainingSec -= elapsedSec;

    if (state.timerState.remainingSec <= 0) {
      finishSegment(true);
      return;
    }
    saveState();
    renderTimer();
  }

  function resetCurrentSegment() {
    const profile = getActiveProfile();
    const sec = phaseDurationSec(state.timerState.phase, profile);
    state.timerState.remainingSec = sec;
    state.timerState.segmentTotalSec = sec;
    state.timerState.isRunning = false;
    state.timerState.startedAt = 0;
    stopTicker();
    saveState();
    renderTimer();
    syncFocusMusic();
  }

  function finishSegment(completed) {
    const currentPhase = state.timerState.phase;
    const profile = getActiveProfile();
    const now = Date.now();
    const plannedSec = state.timerState.segmentTotalSec || phaseDurationSec(currentPhase, profile);
    const actualSec = Math.max(0, Math.min(plannedSec, plannedSec - Math.max(0, state.timerState.remainingSec)));

    state.history.push({
      id: `h_${now}_${Math.floor(Math.random() * 9999)}`,
      taskId: state.timerState.sessionTaskId || null,
      phase: currentPhase,
      plannedSec,
      actualSec: completed ? plannedSec : actualSec,
      completed: !!completed,
      startedAt: state.timerState.startedAt || now - actualSec * 1000,
      endedAt: now
    });

    if (completed && currentPhase === "focus" && state.timerState.sessionTaskId) {
      const task = state.tasks.find((t) => t.id === state.timerState.sessionTaskId);
      if (task) task.completedPomodoros += 1;
    }

    if (currentPhase === "focus" && completed) {
      state.timerState.completedFocusInCycle += 1;
      if (state.settings.autoCheckTaskOnFocusEnd && state.timerState.sessionTaskId) {
        const task = state.tasks.find((t) => t.id === state.timerState.sessionTaskId);
        if (task) task.done = true;
      }
    }
    const next = nextPhase(currentPhase, state.timerState.completedFocusInCycle, profile.cyclesBeforeLongBreak);
    const nextSec = phaseDurationSec(next, profile);

    if (next === "longBreak") state.timerState.completedFocusInCycle = 0;
    state.timerState.phase = next;
    state.timerState.remainingSec = nextSec;
    state.timerState.segmentTotalSec = nextSec;
    state.timerState.startedAt = 0;
    state.timerState.lastTickEpochMs = Date.now();

    const shouldRun = next === "focus" ? state.settings.autoStartFocus : state.settings.autoStartBreak;
    state.timerState.isRunning = !!shouldRun;
    if (!shouldRun) stopTicker();
    if (shouldRun && !tickHandle) startTicker();

    emitEmbedEvent(completed ? "pomodoro:session-complete" : "pomodoro:phase-skip", { phase: currentPhase });
    emitEmbedEvent("pomodoro:phase-change", { phase: next });
    onSegmentAlert(next, completed);

    saveState();
    renderTasks();
    renderTimer();
    renderAnalytics();
    syncFocusMusic();
  }

  function nextPhase(current, completedFocusInCycle, cyclesBeforeLongBreak) {
    if (current === "focus") {
      if (completedFocusInCycle > 0 && completedFocusInCycle % cyclesBeforeLongBreak === 0) {
        return "longBreak";
      }
      return "shortBreak";
    }
    return "focus";
  }

  function onSegmentAlert(nextPhaseName, completed) {
    if (state.settings.soundEnabled) playAlarm(state.settings.soundVolume);
    const phaseLabel = PHASE_META[nextPhaseName].label;
    toast(completed ? `Segment complete. Next: ${phaseLabel}` : `Segment skipped. Next: ${phaseLabel}`);
    if (state.settings.notificationEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("Pomodoro++", { body: `Now in ${phaseLabel}` });
    }
  }

  function playAlarm(volume) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = Math.max(0, Math.min(1, volume || 0.6)) * 0.2;
    const tone = state.settings.alarmTone || "chime";
    const presets = {
      chime: { type: "sine", seq: [880, 660, 990], step: 0.12, dur: 0.1 },
      bell: { type: "triangle", seq: [784, 988, 1174], step: 0.15, dur: 0.2 },
      gong: { type: "sine", seq: [196, 261, 329], step: 0.22, dur: 0.32 }
    };
    const spec = presets[tone] || presets.chime;
    spec.seq.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.type = spec.type;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * spec.step);
      osc.stop(ctx.currentTime + i * spec.step + spec.dur);
    });
    window.setTimeout(() => ctx.close(), 900);
  }

  function syncFocusMusic() {
    const mode = state.settings.focusMusicMode || "off";
    const shouldPlay = state.timerState.isRunning && state.timerState.phase === "focus" && mode !== "off";
    if (!shouldPlay) {
      stopFocusMusic();
      return;
    }
    const volume = Math.max(0, Math.min(1, Number(state.settings.focusMusicVolume ?? 0.22)));
    if (!music.ctx || !music.gain || music.mode !== mode) {
      startFocusMusic(mode, volume);
      return;
    }
    music.gain.gain.setTargetAtTime(volume * 0.06, music.ctx.currentTime, 0.08);
  }

  function startFocusMusic(mode, volume) {
    stopFocusMusic();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = volume * 0.04;
    music.ctx = ctx;
    music.gain = gain;
    music.mode = mode;
    music.nodes = [];

    if (mode === "pulse") {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      oscA.type = "sine";
      oscB.type = "triangle";
      oscA.frequency.value = 174;
      oscB.frequency.value = 261;
      lfo.frequency.value = 0.17;
      lfoGain.gain.value = 20;
      lfo.connect(lfoGain);
      lfoGain.connect(oscA.frequency);
      oscA.connect(gain);
      oscB.connect(gain);
      oscA.start();
      oscB.start();
      lfo.start();
      music.nodes.push(oscA, oscB, lfo, lfoGain);
    } else if (mode === "drone") {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 110;
      filter.type = "lowpass";
      filter.frequency.value = 480;
      osc.connect(filter);
      filter.connect(gain);
      osc.start();
      music.nodes.push(osc, filter);
    } else if (mode === "rain") {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) channel[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      filter.type = "highpass";
      filter.frequency.value = 900;
      source.connect(filter);
      filter.connect(gain);
      source.start();
      music.nodes.push(source, filter);
    }
  }

  function stopFocusMusic() {
    if (!music.ctx) return;
    music.nodes.forEach((node) => {
      if (node && typeof node.stop === "function") {
        try {
          node.stop();
        } catch (error) {
          // No-op.
        }
      }
      if (node && typeof node.disconnect === "function") {
        try {
          node.disconnect();
        } catch (error) {
          // No-op.
        }
      }
    });
    if (music.gain && typeof music.gain.disconnect === "function") {
      try {
        music.gain.disconnect();
      } catch (error) {
        // No-op.
      }
    }
    const ctx = music.ctx;
    music.ctx = null;
    music.gain = null;
    music.mode = "off";
    music.nodes = [];
    ctx.close().catch(() => {});
  }

  function renderTimer() {
    const phase = state.timerState.phase;
    const meta = PHASE_META[phase];
    const display = formatTime(state.timerState.remainingSec, state.settings.showSeconds);
    const progress = state.timerState.segmentTotalSec > 0 ? state.timerState.remainingSec / state.timerState.segmentTotalSec : 1;
    const offset = CIRCLE_LENGTH * (1 - progress);

    el.timerDisplay.textContent = display;
    fitTimerTextToRing(display);
    el.phaseBadge.textContent = meta.label;
    el.ringProgress.style.strokeDashoffset = String(Math.max(0, Math.min(CIRCLE_LENGTH, offset)));
    el.startPauseBtn.textContent = state.timerState.isRunning ? "Pause" : "Start";
    el.miniStartPause.textContent = el.startPauseBtn.textContent;
    el.miniDisplay.textContent = display;
    el.miniPhase.textContent = meta.label;
    syncPiP(display, meta.label, state.timerState.isRunning);

    el.body.classList.remove("phase-focus", "phase-shortBreak", "phase-longBreak");
    el.body.classList.add(meta.className);
  }

  function formatTime(totalSec, showSeconds) {
    const safeSec = Math.max(0, Math.round(totalSec));
    const minutes = Math.floor(safeSec / 60);
    const seconds = safeSec % 60;
    if (!showSeconds) return `${String(minutes).padStart(2, "0")}:00`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function addTask() {
    const title = el.taskInput.value.trim();
    if (!title) return;
    const task = sanitizeTask({
      id: `t_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      title,
      done: false,
      createdAt: Date.now(),
      completedPomodoros: 0
    });
    state.tasks.push(task);
    selectedTaskId = task.id;
    state.timerState.sessionTaskId = task.id;
    el.taskInput.value = "";
    saveState();
    renderTasks();
  }

  function renderTasks() {
    if (!state.tasks.length) {
      el.taskList.innerHTML = `<li class="subtle">No tasks yet.</li>`;
      return;
    }
    const usage = computeTaskUsageMap();
    el.taskList.innerHTML = "";
    state.tasks.forEach((task, index) => {
      const item = document.createElement("li");
      item.className = "task-item";
      const isSelected = task.id === (selectedTaskId || state.timerState.sessionTaskId);
      const taskUsage = usage.get(task.id) || { sessions: 0, minutes: 0 };
      item.innerHTML = `
        <label class="task-check">
          <input type="checkbox" ${task.done ? "checked" : ""} data-action="toggle" data-id="${escapeHtml(task.id)}" />
        </label>
        <button class="btn ghost small task-title ${task.done ? "done" : ""}" data-action="attach" data-id="${escapeHtml(task.id)}">${escapeHtml(task.title)} (${taskUsage.sessions} sess, ${Math.round(taskUsage.minutes)} min, ${task.completedPomodoros} done) ${isSelected ? "[active]" : ""}</button>
        <div>
          <button class="btn ghost small" data-action="up" data-id="${escapeHtml(task.id)}" ${index === 0 ? "disabled" : ""}>^</button>
          <button class="btn ghost small" data-action="down" data-id="${escapeHtml(task.id)}" ${index === state.tasks.length - 1 ? "disabled" : ""}>v</button>
          <button class="btn danger small" data-action="delete" data-id="${escapeHtml(task.id)}">Del</button>
        </div>`;
      el.taskList.appendChild(item);
    });

    el.taskList.querySelectorAll("button,input").forEach((node) => {
      node.addEventListener("click", onTaskAction);
    });
  }

  function onTaskAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const idx = state.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;

    if (action === "toggle") {
      state.tasks[idx].done = !state.tasks[idx].done;
    } else if (action === "attach") {
      selectedTaskId = id;
      state.timerState.sessionTaskId = id;
      toast(`Attached session to "${state.tasks[idx].title}".`);
    } else if (action === "up" && idx > 0) {
      const tmp = state.tasks[idx - 1];
      state.tasks[idx - 1] = state.tasks[idx];
      state.tasks[idx] = tmp;
    } else if (action === "down" && idx < state.tasks.length - 1) {
      const tmp = state.tasks[idx + 1];
      state.tasks[idx + 1] = state.tasks[idx];
      state.tasks[idx] = tmp;
    } else if (action === "delete") {
      const deletingSelected = state.timerState.sessionTaskId === id;
      state.tasks.splice(idx, 1);
      if (deletingSelected) state.timerState.sessionTaskId = null;
      if (selectedTaskId === id) selectedTaskId = null;
    }

    saveState();
    renderTasks();
  }

  function renderAnalytics() {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const from = now - analyticsRangeDays * dayMs;
    const history = state.history.filter((h) => h.phase === "focus" && h.endedAt >= from);
    const todayStart = startOfDay(now);
    const todayMin = sum(history.filter((h) => h.endedAt >= todayStart).map((h) => h.actualSec)) / 60;
    const sessions = history.length;
    const completed = history.filter((h) => h.completed).length;
    const completionRatio = sessions ? Math.round((completed / sessions) * 100) : 0;
    const longestStreak = computeLongestStreakDays();
    const weekMin = sum(state.history
      .filter((h) => h.phase === "focus" && h.endedAt >= now - 7 * dayMs)
      .map((h) => h.actualSec)) / 60;
    const weeklyGoal = 600;
    const weeklyGoalPct = Math.min(100, Math.round((weekMin / weeklyGoal) * 100));
    const tier = rewardTierFromMinutes(weekMin);
    const taskTotals = computeTaskTotals(analyticsRangeDays);
    const topTask = taskTotals[0];

    el.todayMinutes.textContent = `${Math.round(todayMin)} min`;
    el.sessionCount.textContent = String(sessions);
    el.completionRatio.textContent = `${completionRatio}%`;
    el.streakCount.textContent = `${computeStreakDays()} d`;
    el.longestStreakCount.textContent = `${longestStreak} d`;
    el.rewardTier.textContent = tier;
    el.weeklyGoalProgress.textContent = `${weeklyGoalPct}%`;
    el.topTaskLabel.textContent = topTask ? `${topTask.title} (${Math.round(topTask.minutes)} min)` : "None";
    renderTaskBreakdown(taskTotals);

    drawWeeklyBars();
    drawHeatmap();
  }

  function drawWeeklyBars() {
    const canvas = el.weeklyChart;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cssWidth = canvas.clientWidth || 640;
    canvas.width = cssWidth * (window.devicePixelRatio || 1);
    canvas.height = 180 * (window.devicePixelRatio || 1);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, cssWidth, 180);

    const bars = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = startOfDay(Date.now() - i * 24 * 60 * 60 * 1000);
      const next = day + 24 * 60 * 60 * 1000;
      const minutes = sum(state.history
        .filter((h) => h.phase === "focus" && h.endedAt >= day && h.endedAt < next)
        .map((h) => h.actualSec)) / 60;
      bars.push({ day, minutes });
    }
    const max = Math.max(25, ...bars.map((b) => b.minutes));
    const gap = 8;
    const barW = (cssWidth - gap * 8) / 7;

    bars.forEach((b, i) => {
      const h = Math.max(3, (b.minutes / max) * 130);
      const x = gap + i * (barW + gap);
      const y = 150 - h;
      ctx.fillStyle = "rgba(86,227,180,0.78)";
      ctx.fillRect(x, y, barW, h);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "11px Segoe UI";
      const label = new Date(b.day).toLocaleDateString(undefined, { weekday: "short" });
      ctx.fillText(label, x + 3, 168);
    });
  }

  function drawHeatmap() {
    const cells = [];
    const totalDays = 30;
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const dayStart = startOfDay(Date.now() - i * dayMs);
      const dayEnd = dayStart + dayMs;
      const minutes = sum(state.history
        .filter((h) => h.phase === "focus" && h.endedAt >= dayStart && h.endedAt < dayEnd)
        .map((h) => h.actualSec)) / 60;
      cells.push(minutes);
    }
    const max = Math.max(1, ...cells);
    el.heatmap.innerHTML = cells
      .map((m) => {
        const alpha = Math.min(0.95, Math.max(0.12, m / max));
        return `<div class="heat-cell" style="background: rgba(86, 227, 180, ${alpha.toFixed(2)})" title="${Math.round(m)} min"></div>`;
      })
      .join("");
  }

  function computeStreakDays() {
    let streak = 0;
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 366; i += 1) {
      const dayStart = startOfDay(Date.now() - i * dayMs);
      const dayEnd = dayStart + dayMs;
      const minutes = sum(state.history
        .filter((h) => h.phase === "focus" && h.endedAt >= dayStart && h.endedAt < dayEnd)
        .map((h) => h.actualSec)) / 60;
      if (minutes > 0) streak += 1;
      else break;
    }
    return streak;
  }

  function computeLongestStreakDays() {
    const focusHistory = state.history.filter((h) => h.phase === "focus");
    if (!focusHistory.length) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const firstDay = startOfDay(Math.min(...focusHistory.map((h) => h.endedAt)));
    const lastDay = startOfDay(Date.now());
    let longest = 0;
    let current = 0;
    for (let day = firstDay; day <= lastDay; day += dayMs) {
      const hasMinutes = focusHistory.some((h) => h.endedAt >= day && h.endedAt < day + dayMs && h.actualSec > 0);
      if (hasMinutes) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
    return longest;
  }

  function rewardTierFromMinutes(weeklyMinutes) {
    if (weeklyMinutes >= 600) return "Legend";
    if (weeklyMinutes >= 300) return "Deep Work";
    if (weeklyMinutes >= 120) return "Flow";
    return "Starter";
  }

  function computeTaskUsageMap() {
    const usage = new Map();
    state.history.forEach((h) => {
      if (h.phase !== "focus" || !h.taskId) return;
      const entry = usage.get(h.taskId) || { sessions: 0, minutes: 0 };
      entry.sessions += 1;
      entry.minutes += (Number(h.actualSec) || 0) / 60;
      usage.set(h.taskId, entry);
    });
    return usage;
  }

  function computeTaskTotals(rangeDays) {
    const from = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const usage = new Map();
    state.history.forEach((h) => {
      if (h.phase !== "focus" || !h.taskId || h.endedAt < from) return;
      const entry = usage.get(h.taskId) || { taskId: h.taskId, minutes: 0, sessions: 0 };
      entry.minutes += (Number(h.actualSec) || 0) / 60;
      entry.sessions += 1;
      usage.set(h.taskId, entry);
    });
    return Array.from(usage.values())
      .map((entry) => {
        const task = state.tasks.find((t) => t.id === entry.taskId);
        return {
          ...entry,
          title: task ? task.title : "Deleted Task"
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }

  function renderTaskBreakdown(taskTotals) {
    if (!taskTotals.length) {
      el.taskBreakdown.innerHTML = `<li class="subtle">No focus time tracked yet.</li>`;
      return;
    }
    el.taskBreakdown.innerHTML = taskTotals
      .slice(0, 6)
      .map((item) => `<li><span>${escapeHtml(item.title)}</span><strong>${Math.round(item.minutes)} min | ${item.sessions} sessions</strong></li>`)
      .join("");
  }

  function exportAnalyticsCsv(rangeDays, label) {
    const { header, rows } = buildExportRows(rangeDays);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `pomodoro_analytics_${label}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${label} CSV.`);
  }

  function exportAnalyticsXlsx(rangeDays, label) {
    const { header, rows } = buildExportRows(rangeDays);
    const tableRows = [header, ...rows]
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `pomodoro_analytics_${label}_${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${label} XLSX.`);
  }

  function buildExportRows(rangeDays) {
    const from = rangeDays === 1
      ? startOfDay(Date.now())
      : Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const rows = state.history
      .filter((h) => h.phase === "focus" && h.endedAt >= from)
      .map((h) => {
        const task = state.tasks.find((t) => t.id === h.taskId);
        return [
          new Date(h.endedAt).toISOString(),
          task ? task.title : "",
          h.phase,
          h.completed ? "yes" : "no",
          ((Number(h.plannedSec) || 0) / 60).toFixed(2),
          ((Number(h.actualSec) || 0) / 60).toFixed(2),
          new Date(Number(h.startedAt) || h.endedAt).toISOString(),
          new Date(h.endedAt).toISOString()
        ].map(String);
      });
    const header = ["date", "task", "phase", "completed", "planned_minutes", "actual_minutes", "started_at", "ended_at"];
    return { header, rows };
  }

  function writeCloudBackup() {
    localStorage.setItem(CLOUD_BACKUP_KEY, JSON.stringify({
      savedAt: Date.now(),
      data: state
    }));
  }

  function restoreFromCloudBackup() {
    try {
      const raw = localStorage.getItem(CLOUD_BACKUP_KEY);
      if (!raw) {
        toast("No backup found.");
        return;
      }
      const parsed = JSON.parse(raw);
      const incoming = migrateState(parsed?.data || parsed);
      Object.assign(state, incoming);
      saveState();
      renderProfiles();
      renderSettings();
      renderTasks();
      renderTimer();
      renderAnalytics();
      syncFocusMusic();
      if (state.timerState.isRunning && !tickHandle) startTicker();
      toast("Backup restored.");
    } catch (error) {
      toast("Backup restore failed.");
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function applyEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    const embed = params.get("embed") === "1";
    if (embed) document.body.classList.add("embed-mode");
    const mini = params.get("mini");
    if (mini === "1") openMiniTimer();
    const profile = params.get("profile");
    if (profile && state.profiles.some((p) => p.id === profile)) {
      state.activeProfileId = profile;
    }
    const autostart = params.get("autostart");
    if (autostart === "1") {
      state.timerState.isRunning = true;
      state.timerState.lastTickEpochMs = Date.now();
    }
    const theme = params.get("theme");
    if (theme === "light" || theme === "dark" || theme === "auto") state.settings.theme = theme;
  }

  function emitEmbedEvent(type, detail) {
    try {
      window.parent?.postMessage({ type, detail }, "*");
    } catch (error) {
      // No-op.
    }
  }

  function toggleMiniTimer() {
    if (el.miniTimer.classList.contains("hidden")) openMiniTimer();
    else closeMiniTimer();
  }

  function openMiniTimer() {
    el.miniTimer.classList.remove("hidden");
    clampMiniToViewport();
  }

  async function togglePiPWindow() {
    if (pip.win && !pip.win.closed) {
      closePiPWindow();
      return;
    }
    if ("documentPictureInPicture" in window) {
      try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 330,
          height: 220
        });
        initPiPWindow(pipWindow, true);
        return;
      } catch (error) {
        // Fall through to popup fallback.
      }
    }
    const popup = window.open("", "pomodoro_plus_pip", "width=330,height=220,resizable=yes");
    if (!popup) {
      toast("Unable to open PiP window. Allow popups for this site.");
      return;
    }
    initPiPWindow(popup, false);
  }

  function initPiPWindow(win, isDocumentPiP) {
    pip.win = win;
    pip.isDocumentPiP = isDocumentPiP;
    const doc = win.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pomodoro++ PiP</title>
      <style>
        :root { color-scheme: dark; }
        body { margin:0; font-family: Inter, Segoe UI, Arial, sans-serif; background:#0f1727; color:#e8f1ff; }
        .wrap { height:100vh; display:grid; align-content:center; gap:10px; padding:14px; }
        .phase { text-align:center; font-size:14px; opacity:0.9; }
        .time { text-align:center; font-size:56px; font-weight:800; line-height:1; letter-spacing:0.5px; font-variant-numeric: tabular-nums; }
        .actions { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; }
        button { border:1px solid rgba(255,255,255,0.25); background:#1d2a42; color:#f0f6ff; border-radius:10px; padding:8px 12px; cursor:pointer; }
        button.primary { background:#56e3b4; color:#052417; border-color:#56e3b4; font-weight:700; }
      </style></head><body>
      <div class="wrap">
        <div id="pipPhase" class="phase">Focus</div>
        <div id="pipDisplay" class="time">25:00</div>
        <div class="actions">
          <button id="pipStartPause" class="primary" type="button">Start</button>
          <button id="pipSkip" type="button">Skip</button>
          <button id="pipClose" type="button">Close</button>
        </div>
      </div></body></html>`);
    doc.close();

    pip.phase = doc.getElementById("pipPhase");
    pip.display = doc.getElementById("pipDisplay");
    pip.startPause = doc.getElementById("pipStartPause");
    pip.skip = doc.getElementById("pipSkip");
    pip.close = doc.getElementById("pipClose");

    pip.startPause.addEventListener("click", toggleStartPause);
    pip.skip.addEventListener("click", () => finishSegment(false));
    pip.close.addEventListener("click", closePiPWindow);

    const onClosed = () => {
      pip.win = null;
      pip.display = null;
      pip.phase = null;
      pip.startPause = null;
      pip.skip = null;
      pip.close = null;
      updatePiPButton();
    };
    win.addEventListener(isDocumentPiP ? "pagehide" : "beforeunload", onClosed, { once: true });
    updatePiPButton();
    renderTimer();
  }

  function closePiPWindow() {
    if (!pip.win || pip.win.closed) {
      pip.win = null;
      updatePiPButton();
      return;
    }
    pip.win.close();
    pip.win = null;
    pip.display = null;
    pip.phase = null;
    pip.startPause = null;
    pip.skip = null;
    pip.close = null;
    updatePiPButton();
  }

  function updatePiPButton() {
    el.pipToggle.textContent = pip.win && !pip.win.closed ? "Close PiP" : "PiP Window";
  }

  function syncPiP(display, phaseLabel, isRunning) {
    if (!pip.win || pip.win.closed || !pip.display || !pip.phase || !pip.startPause) {
      updatePiPButton();
      return;
    }
    pip.display.textContent = display;
    pip.phase.textContent = phaseLabel;
    pip.startPause.textContent = isRunning ? "Pause" : "Start";
  }

  function closeMiniTimer() {
    el.miniTimer.classList.add("hidden");
  }

  function onMiniPointerDown(event) {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    const rect = el.miniTimer.getBoundingClientRect();
    activeDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    el.miniTimer.setPointerCapture(event.pointerId);
  }

  function onMiniPointerMove(event) {
    if (!activeDrag || el.miniTimer.classList.contains("hidden")) return;
    const x = event.clientX - activeDrag.offsetX;
    const y = event.clientY - activeDrag.offsetY;
    setMiniPos(x, y, true);
  }

  function onMiniPointerUp() {
    if (!activeDrag) return;
    activeDrag = null;
    persistMiniPos();
  }

  function setMiniPos(x, y, clampOnly) {
    const maxX = window.innerWidth - el.miniTimer.offsetWidth - 8;
    const maxY = window.innerHeight - el.miniTimer.offsetHeight - 8;
    const safeX = Math.max(8, Math.min(maxX, x));
    const safeY = Math.max(8, Math.min(maxY, y));
    el.miniTimer.style.left = `${safeX}px`;
    el.miniTimer.style.top = `${safeY}px`;
    el.miniTimer.style.right = "auto";
    el.miniTimer.style.bottom = "auto";
    if (!clampOnly) persistMiniPos();
  }

  function clampMiniToViewport() {
    const pos = state.settings.miniPos;
    if (!pos || pos.x == null || pos.y == null) return;
    setMiniPos(pos.x, pos.y, true);
  }

  function restoreMiniPosition() {
    const pos = state.settings.miniPos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      setMiniPos(pos.x, pos.y, true);
    }
  }

  function persistMiniPos() {
    const rect = el.miniTimer.getBoundingClientRect();
    state.settings.miniPos = { x: rect.left, y: rect.top };
    saveState();
  }

  function applyThemeAndA11y() {
    const theme = state.settings.theme || "auto";
    if (theme === "auto") {
      const isLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      document.documentElement.dataset.theme = isLight ? "light" : "dark";
    } else {
      document.documentElement.dataset.theme = theme;
    }
    document.documentElement.dataset.font = state.settings.fontFamily || "inter";
    document.documentElement.classList.toggle("high-contrast", !!state.settings.highContrast);
  }

  function toast(message) {
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    el.toastRegion.appendChild(item);
    window.setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(6px)";
    }, 2200);
    window.setTimeout(() => item.remove(), 2800);
  }

  function isValidProfile(p) {
    if (!p || typeof p !== "object") return false;
    return (
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      Number.isFinite(p.focusMin) && p.focusMin >= 1 && p.focusMin <= MAX_MINUTES_PER_SEGMENT &&
      Number.isFinite(p.shortBreakMin) && p.shortBreakMin >= 1 && p.shortBreakMin <= MAX_MINUTES_PER_SEGMENT &&
      Number.isFinite(p.longBreakMin) && p.longBreakMin >= 1 && p.longBreakMin <= MAX_MINUTES_PER_SEGMENT &&
      Number.isFinite(p.cyclesBeforeLongBreak) && p.cyclesBeforeLongBreak >= 1
    );
  }

  function overCapField(profile) {
    if (profile.focusMin > MAX_MINUTES_PER_SEGMENT) return "focus";
    if (profile.shortBreakMin > MAX_MINUTES_PER_SEGMENT) return "shortBreak";
    if (profile.longBreakMin > MAX_MINUTES_PER_SEGMENT) return "longBreak";
    return null;
  }

  function showTimeError(field) {
    clearTimeErrors();
    if (field === "focus") el.focusError.classList.remove("hidden");
    if (field === "shortBreak") el.shortBreakError.classList.remove("hidden");
    if (field === "longBreak") el.longBreakError.classList.remove("hidden");
  }

  function clearTimeErrors() {
    el.focusError.classList.add("hidden");
    el.shortBreakError.classList.add("hidden");
    el.longBreakError.classList.add("hidden");
  }

  function validateTimeCapField(field, value) {
    if (!Number.isFinite(value) || value <= MAX_MINUTES_PER_SEGMENT) {
      if (field === "focus") el.focusError.classList.add("hidden");
      if (field === "shortBreak") el.shortBreakError.classList.add("hidden");
      if (field === "longBreak") el.longBreakError.classList.add("hidden");
      return true;
    }
    showTimeError(field);
    return false;
  }

  function fitTimerTextToRing(displayText) {
    const wrap = el.timerWrap;
    if (!wrap) return;
    const innerTarget = wrap.clientWidth * 0.72;
    const length = displayText.length;
    let size = innerTarget / Math.max(length * 0.56, 2.4);
    size = Math.max(24, Math.min(72, size));
    el.timerDisplay.style.fontSize = `${size}px`;
    let guard = 0;
    while (el.timerDisplay.scrollWidth > innerTarget && size > 20 && guard < 20) {
      size -= 1;
      el.timerDisplay.style.fontSize = `${size}px`;
      guard += 1;
    }
  }

  function sanitizeTask(task) {
    return {
      id: String(task?.id || `t_${Date.now()}`),
      title: String(task?.title || "Untitled"),
      done: !!task?.done,
      createdAt: Number(task?.createdAt || Date.now()),
      completedPomodoros: Number(task?.completedPomodoros || 0)
    };
  }

  function isValidHistory(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (!["focus", "shortBreak", "longBreak"].includes(entry.phase)) return false;
    return Number.isFinite(entry.endedAt);
  }

  function sum(values) {
    return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
  }

  function startOfDay(epochMs) {
    const d = new Date(epochMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }
})();
