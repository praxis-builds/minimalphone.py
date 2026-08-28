(() => {
    "use strict";

    const APP_VERSION = 2;
    const STORAGE_KEY = "minimal-phone-state-v2";
    const MAX_TASKS = 10;
    const MAX_APPS = 12;
    const VALID_VIEWS = new Set(["home", "tasks", "focus", "settings"]);
    const VALID_ACCENTS = new Set(["mono", "sage", "amber", "ice"]);
    const BLOCKED_SCHEMES = new Set(["javascript", "data", "file", "vbscript", "blob", "about"]);

    const DEFAULT_APPS = [
        { id: "call", name: "Call", symbol: "C", target: "minimal:call", mindful: false },
        { id: "messages", name: "Messages", symbol: "M", target: "sms:", mindful: false },
        { id: "whatsapp", name: "WhatsApp", symbol: "W", target: "https://wa.me/", mindful: false },
        { id: "maps", name: "Maps", symbol: "↗", target: "https://maps.apple.com/", mindful: false },
        { id: "music", name: "Music", symbol: "♪", target: "https://music.apple.com/", mindful: false },
        { id: "chatgpt", name: "ChatGPT", symbol: "AI", target: "https://chatgpt.com/", mindful: false },
        { id: "youtube", name: "YouTube", symbol: "Y", target: "https://www.youtube.com/", mindful: true }
    ];

    const DEFAULT_STATE = {
        version: APP_VERSION,
        profile: {
            name: "",
            clock24: false,
            showSeconds: false,
            accent: "mono"
        },
        priority: "",
        tasks: [],
        apps: DEFAULT_APPS,
        focus: {
            duration: 25 * 60,
            remaining: 25 * 60,
            running: false,
            endAt: null
        },
        stats: {
            date: getDayKey(),
            sessions: 0
        }
    };

    const elements = {
        views: [...document.querySelectorAll(".view")],
        navigationButtons: [...document.querySelectorAll("[data-go]")],
        navButtons: [...document.querySelectorAll(".nav-button")],
        connectionStatus: document.querySelector("#connection-status"),
        connectionLabel: document.querySelector("#connection-label"),
        dateDisplay: document.querySelector("#date-display"),
        timeDisplay: document.querySelector("#time-display"),
        greetingDisplay: document.querySelector("#greeting-display"),
        priorityForm: document.querySelector("#priority-form"),
        priorityInput: document.querySelector("#priority-input"),
        priorityDisplay: document.querySelector("#priority-display"),
        clearPriorityButton: document.querySelector("#clear-priority-button"),
        launcherList: document.querySelector("#launcher-list"),
        emptyLauncher: document.querySelector("#empty-launcher"),
        editAppsButton: document.querySelector("#edit-apps-button"),
        homeTaskCount: document.querySelector("#home-task-count"),
        homeSessionCount: document.querySelector("#home-session-count"),
        taskForm: document.querySelector("#task-form"),
        taskInput: document.querySelector("#task-input"),
        taskList: document.querySelector("#task-list"),
        taskCountLabel: document.querySelector("#task-count-label"),
        clearCompletedButton: document.querySelector("#clear-completed-button"),
        emptyTasks: document.querySelector("#empty-tasks"),
        focusIntention: document.querySelector("#focus-intention"),
        timerRing: document.querySelector("#timer-ring"),
        timerDisplay: document.querySelector("#timer-display"),
        timerStatus: document.querySelector("#timer-status"),
        presetButtons: [...document.querySelectorAll(".preset-button")],
        startTimerButton: document.querySelector("#start-timer-button"),
        resetTimerButton: document.querySelector("#reset-timer-button"),
        profileForm: document.querySelector("#profile-form"),
        nameInput: document.querySelector("#name-input"),
        clockFormatSelect: document.querySelector("#clock-format-select"),
        showSecondsInput: document.querySelector("#show-seconds-input"),
        accentSelect: document.querySelector("#accent-select"),
        appForm: document.querySelector("#app-form"),
        appNameInput: document.querySelector("#app-name-input"),
        appSymbolInput: document.querySelector("#app-symbol-input"),
        appTargetInput: document.querySelector("#app-target-input"),
        appMindfulInput: document.querySelector("#app-mindful-input"),
        appSettings: document.querySelector("#app-settings"),
        appSettingsList: document.querySelector("#app-settings-list"),
        appCountLabel: document.querySelector("#app-count-label"),
        restoreAppsButton: document.querySelector("#restore-apps-button"),
        customTimerForm: document.querySelector("#custom-timer-form"),
        customMinutesInput: document.querySelector("#custom-minutes-input"),
        exportButton: document.querySelector("#export-button"),
        importButton: document.querySelector("#import-button"),
        importInput: document.querySelector("#import-input"),
        resetAllButton: document.querySelector("#reset-all-button"),
        installStatus: document.querySelector("#install-status"),
        intentionModal: document.querySelector("#intention-modal"),
        pendingAppName: document.querySelector("#pending-app-name"),
        openingReasonInput: document.querySelector("#opening-reason-input"),
        continueAppButton: document.querySelector("#continue-app-button"),
        callModal: document.querySelector("#call-modal"),
        callForm: document.querySelector("#call-form"),
        phoneNumberInput: document.querySelector("#phone-number-input"),
        toast: document.querySelector("#toast")
    };

    let state = loadState();
    let currentView = "home";
    let pendingApp = null;
    let intentionCountdown = null;
    let toastTimeout = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(number, minimum, maximum) {
        return Math.min(Math.max(number, minimum), maximum);
    }

    function makeId(prefix) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function cleanText(value, maximumLength) {
        return String(value ?? "")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, maximumLength);
    }

    function cleanSymbol(value, fallback = "•") {
        const symbol = Array.from(cleanText(value, 8)).slice(0, 2).join("");
        return symbol || fallback;
    }

    function getDayKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function normalizeTargetInput(value) {
        let target = cleanText(value, 500);

        if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) {
            target = `https://${target}`;
        }

        return target;
    }

    function isSafeTarget(target) {
        const match = String(target).match(/^([a-z][a-z0-9+.-]*):/i);

        if (!match) {
            return false;
        }

        const scheme = match[1].toLowerCase();

        if (BLOCKED_SCHEMES.has(scheme) || scheme === "http") {
            return false;
        }

        if (scheme === "minimal" && target !== "minimal:call") {
            return false;
        }

        return true;
    }

    function normalizeApp(rawApp, index) {
        if (!rawApp || typeof rawApp !== "object") {
            return null;
        }

        const name = cleanText(rawApp.name, 24);
        const target = normalizeTargetInput(rawApp.target);

        if (!name || !isSafeTarget(target)) {
            return null;
        }

        return {
            id: cleanText(rawApp.id, 90) || `imported-app-${index}`,
            name,
            symbol: cleanSymbol(rawApp.symbol, name.charAt(0).toUpperCase()),
            target,
            mindful: Boolean(rawApp.mindful)
        };
    }

    function normalizeTask(rawTask, index) {
        if (!rawTask || typeof rawTask !== "object") {
            return null;
        }

        const text = cleanText(rawTask.text, 140);

        if (!text) {
            return null;
        }

        return {
            id: cleanText(rawTask.id, 90) || `imported-task-${index}`,
            text,
            done: Boolean(rawTask.done),
            createdAt: Number.isFinite(Number(rawTask.createdAt)) ? Number(rawTask.createdAt) : Date.now()
        };
    }

    function normalizeState(rawState) {
        const raw = rawState && typeof rawState === "object" ? rawState : {};
        const rawProfile = raw.profile && typeof raw.profile === "object" ? raw.profile : {};
        const rawFocus = raw.focus && typeof raw.focus === "object" ? raw.focus : {};
        const rawStats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};

        let duration = Number(rawFocus.duration);
        duration = Number.isFinite(duration) ? clamp(Math.round(duration), 60, 180 * 60) : DEFAULT_STATE.focus.duration;

        let remaining = Number(rawFocus.remaining);
        remaining = Number.isFinite(remaining) ? clamp(Math.round(remaining), 0, duration) : duration;

        const endAt = Number(rawFocus.endAt);
        const apps = Array.isArray(raw.apps)
            ? raw.apps.map(normalizeApp).filter(Boolean).slice(0, MAX_APPS)
            : clone(DEFAULT_APPS);

        const tasks = Array.isArray(raw.tasks)
            ? raw.tasks.map(normalizeTask).filter(Boolean).slice(0, 100)
            : [];

        const stateDate = cleanText(rawStats.date, 10);
        const today = getDayKey();

        return {
            version: APP_VERSION,
            profile: {
                name: cleanText(rawProfile.name, 32),
                clock24: Boolean(rawProfile.clock24),
                showSeconds: Boolean(rawProfile.showSeconds),
                accent: VALID_ACCENTS.has(rawProfile.accent) ? rawProfile.accent : "mono"
            },
            priority: cleanText(raw.priority, 120),
            tasks,
            apps,
            focus: {
                duration,
                remaining,
                running: Boolean(rawFocus.running) && Number.isFinite(endAt),
                endAt: Number.isFinite(endAt) ? endAt : null
            },
            stats: {
                date: today,
                sessions: stateDate === today ? clamp(Number(rawStats.sessions) || 0, 0, 10000) : 0
            }
        };
    }

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? normalizeState(JSON.parse(saved)) : normalizeState(clone(DEFAULT_STATE));
        } catch (error) {
            console.warn("Minimal could not read saved data.", error);
            return normalizeState(clone(DEFAULT_STATE));
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("Minimal could not save data.", error);
            showToast("This browser could not save the change.");
        }
    }

    function showToast(message) {
        window.clearTimeout(toastTimeout);
        elements.toast.textContent = message;
        elements.toast.hidden = false;

        toastTimeout = window.setTimeout(() => {
            elements.toast.hidden = true;
        }, 2600);
    }

    function updateConnectionStatus() {
        const online = navigator.onLine;
        elements.connectionStatus.classList.toggle("is-offline", !online);
        elements.connectionLabel.textContent = online ? "LOCAL" : "OFFLINE";
    }

    function updateClock() {
        const now = new Date();
        const timeOptions = {
            hour: "numeric",
            minute: "2-digit",
            hour12: !state.profile.clock24
        };

        if (state.profile.showSeconds) {
            timeOptions.second = "2-digit";
        }

        elements.timeDisplay.textContent = new Intl.DateTimeFormat(undefined, timeOptions).format(now);
        elements.dateDisplay.textContent = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
        }).format(now).toUpperCase();

        const hour = now.getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        elements.greetingDisplay.textContent = state.profile.name
            ? `${greeting}, ${state.profile.name}.`
            : `${greeting}. Move with intention.`;

        if (state.stats.date !== getDayKey(now)) {
            state.stats.date = getDayKey(now);
            state.stats.sessions = 0;
            saveState();
            renderSummary();
        }
    }

    function navigateTo(viewName, options = {}) {
        const view = VALID_VIEWS.has(viewName) ? viewName : "home";
        currentView = view;

        elements.views.forEach((section) => {
            const active = section.dataset.view === view;
            section.hidden = !active;
            section.classList.toggle("is-active", active);
        });

        elements.navButtons.forEach((button) => {
            const active = button.dataset.go === view;
            button.classList.toggle("is-active", active);
            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });

        if (!options.keepUrl) {
            const url = new URL(window.location.href);
            if (view === "home") {
                url.searchParams.delete("view");
            } else {
                url.searchParams.set("view", view);
            }
            history.replaceState(null, "", url);
        }

        window.scrollTo({ top: 0, behavior: "auto" });
    }

    function renderPriority() {
        const hasPriority = Boolean(state.priority);
        elements.priorityDisplay.textContent = hasPriority ? state.priority : "Choose what matters most.";
        elements.priorityDisplay.classList.toggle("is-empty", !hasPriority);
        elements.clearPriorityButton.hidden = !hasPriority;
        elements.focusIntention.textContent = hasPriority ? state.priority : "Choose an intention on Home.";
    }

    function createLauncherButton(app) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "launcher-item";
        button.classList.toggle("is-mindful", app.mindful);
        button.setAttribute("aria-label", `${app.name}${app.mindful ? ", intentional pause enabled" : ""}`);

        const symbol = document.createElement("span");
        symbol.className = "launcher-symbol";
        symbol.setAttribute("aria-hidden", "true");
        symbol.textContent = app.symbol;

        const name = document.createElement("span");
        name.className = "launcher-name";
        name.textContent = app.name;

        const action = document.createElement("span");
        action.className = "launcher-action";
        action.setAttribute("aria-hidden", "true");
        action.textContent = app.mindful ? "pause" : "open";

        button.append(symbol, name, action);
        button.addEventListener("click", () => openApp(app));
        return button;
    }

    function renderLauncher() {
        elements.launcherList.replaceChildren();
        state.apps.forEach((app) => elements.launcherList.append(createLauncherButton(app)));
        elements.emptyLauncher.hidden = state.apps.length > 0;
    }

    function renderSummary() {
        const remainingTasks = state.tasks.filter((task) => !task.done).length;
        elements.homeTaskCount.textContent = String(remainingTasks);
        elements.homeSessionCount.textContent = String(state.stats.sessions);
    }

    function createTaskItem(task) {
        const item = document.createElement("li");
        item.className = "task-item";
        item.classList.toggle("is-done", task.done);
        item.classList.toggle("is-priority", state.priority === task.text);

        const checkButton = document.createElement("button");
        checkButton.type = "button";
        checkButton.className = "task-check";
        checkButton.textContent = task.done ? "✓" : "";
        checkButton.setAttribute("aria-label", task.done ? `Mark ${task.text} incomplete` : `Complete ${task.text}`);
        checkButton.addEventListener("click", () => toggleTask(task.id));

        const textButton = document.createElement("button");
        textButton.type = "button";
        textButton.className = "task-text-button";
        textButton.textContent = task.text;
        textButton.addEventListener("click", () => toggleTask(task.id));

        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.className = "task-pin";
        pinButton.textContent = "↑";
        pinButton.setAttribute("aria-label", `Make ${task.text} today's intention`);
        pinButton.addEventListener("click", () => {
            state.priority = task.text;
            saveState();
            renderPriority();
            renderTasks();
            showToast("Intention updated.");
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "task-delete";
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", `Delete ${task.text}`);
        deleteButton.addEventListener("click", () => deleteTask(task.id));

        item.append(checkButton, textButton, pinButton, deleteButton);
        return item;
    }

    function renderTasks() {
        elements.taskList.replaceChildren();
        state.tasks.forEach((task) => elements.taskList.append(createTaskItem(task)));

        const activeCount = state.tasks.filter((task) => !task.done).length;
        const completedCount = state.tasks.length - activeCount;
        elements.taskCountLabel.textContent = `${activeCount} of ${MAX_TASKS} active`;
        elements.emptyTasks.hidden = state.tasks.length > 0;
        elements.clearCompletedButton.disabled = completedCount === 0;
        renderSummary();
    }

    function toggleTask(taskId) {
        const task = state.tasks.find((candidate) => candidate.id === taskId);
        if (!task) return;

        if (task.done) {
            const activeCount = state.tasks.filter((candidate) => !candidate.done).length;
            if (activeCount >= MAX_TASKS) {
                showToast(`Finish or remove one of your ${MAX_TASKS} active tasks first.`);
                return;
            }
        }

        task.done = !task.done;
        saveState();
        renderTasks();
    }

    function deleteTask(taskId) {
        state.tasks = state.tasks.filter((task) => task.id !== taskId);
        saveState();
        renderTasks();
    }

    function formatTimer(totalSeconds) {
        const safeSeconds = Math.max(0, Math.round(totalSeconds));
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function getLiveRemaining() {
        if (!state.focus.running || !state.focus.endAt) {
            return state.focus.remaining;
        }

        return Math.max(0, Math.ceil((state.focus.endAt - Date.now()) / 1000));
    }

    function completeFocusSession() {
        if (!state.focus.running) return;

        state.focus.running = false;
        state.focus.endAt = null;
        state.focus.remaining = 0;
        state.stats.date = getDayKey();
        state.stats.sessions += 1;
        saveState();
        renderFocus();
        renderSummary();

        if (typeof navigator.vibrate === "function") {
            navigator.vibrate([180, 100, 180]);
        }

        showToast("Focus complete. Step away for a moment.");
    }

    function tickFocus() {
        if (!state.focus.running) return;

        const remaining = getLiveRemaining();

        if (remaining <= 0) {
            completeFocusSession();
            return;
        }

        state.focus.remaining = remaining;
        renderFocus();
    }

    function renderFocus() {
        const duration = Math.max(1, state.focus.duration);
        const remaining = state.focus.running ? getLiveRemaining() : state.focus.remaining;
        state.focus.remaining = remaining;

        const elapsedRatio = clamp((duration - remaining) / duration, 0, 1);
        const progressDegrees = `${elapsedRatio * 360}deg`;
        elements.timerRing.style.setProperty("--timer-progress", progressDegrees);
        elements.timerDisplay.textContent = formatTimer(remaining);
        elements.timerRing.setAttribute("aria-label", `${formatTimer(remaining)} remaining`);

        if (state.focus.running) {
            elements.timerStatus.textContent = "Focusing";
            elements.startTimerButton.textContent = "Pause";
            document.title = `${formatTimer(remaining)} · Minimal`;
        } else if (remaining === 0) {
            elements.timerStatus.textContent = "Complete";
            elements.startTimerButton.textContent = "Start again";
            document.title = "Minimal Phone";
        } else if (remaining < duration) {
            elements.timerStatus.textContent = "Paused";
            elements.startTimerButton.textContent = "Resume";
            document.title = "Minimal Phone";
        } else {
            elements.timerStatus.textContent = "Ready";
            elements.startTimerButton.textContent = "Start";
            document.title = "Minimal Phone";
        }

        elements.presetButtons.forEach((button) => {
            button.classList.toggle("is-active", Number(button.dataset.minutes) * 60 === duration);
        });
    }

    function selectTimerDuration(minutes) {
        const duration = clamp(Math.round(Number(minutes) * 60), 60, 180 * 60);
        state.focus.duration = duration;
        state.focus.remaining = duration;
        state.focus.running = false;
        state.focus.endAt = null;
        saveState();
        renderFocus();
    }

    function startOrPauseTimer() {
        if (state.focus.running) {
            state.focus.remaining = getLiveRemaining();
            state.focus.running = false;
            state.focus.endAt = null;
            showToast("Timer paused.");
        } else {
            if (state.focus.remaining <= 0) {
                state.focus.remaining = state.focus.duration;
            }

            state.focus.running = true;
            state.focus.endAt = Date.now() + state.focus.remaining * 1000;
        }

        saveState();
        renderFocus();
    }

    function resetTimer() {
        state.focus.running = false;
        state.focus.endAt = null;
        state.focus.remaining = state.focus.duration;
        saveState();
        renderFocus();
        showToast("Timer reset.");
    }

    function createEditorButton(label, className = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `editor-button ${className}`.trim();
        button.textContent = label;
        return button;
    }

    function renderAppSettings() {
        elements.appSettingsList.replaceChildren();
        elements.appCountLabel.textContent = `${state.apps.length} / ${MAX_APPS}`;

        state.apps.forEach((app, index) => {
            const editor = document.createElement("details");
            editor.className = "app-editor";

            const summary = document.createElement("summary");
            const symbol = document.createElement("span");
            symbol.className = "editor-symbol";
            symbol.textContent = app.symbol;

            const name = document.createElement("span");
            name.textContent = app.name;

            const status = document.createElement("span");
            status.className = "editor-status";
            status.textContent = app.mindful ? "pause" : "direct";
            summary.append(symbol, name, status);

            const body = document.createElement("div");
            body.className = "app-editor-body";

            const nameLabel = document.createElement("label");
            nameLabel.textContent = "Name";
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.maxLength = 24;
            nameInput.value = app.name;

            const symbolLabel = document.createElement("label");
            symbolLabel.textContent = "Mark";
            const symbolInput = document.createElement("input");
            symbolInput.type = "text";
            symbolInput.maxLength = 2;
            symbolInput.value = app.symbol;

            const targetLabel = document.createElement("label");
            targetLabel.textContent = "App or Shortcut link";
            const targetInput = document.createElement("input");
            targetInput.type = "text";
            targetInput.maxLength = 500;
            targetInput.value = app.target;

            const mindfulLabel = document.createElement("label");
            mindfulLabel.className = "toggle-row";
            const mindfulText = document.createElement("span");
            const mindfulStrong = document.createElement("strong");
            mindfulStrong.textContent = "Intentional pause";
            const mindfulSmall = document.createElement("small");
            mindfulSmall.textContent = "Wait five seconds before opening.";
            mindfulText.append(mindfulStrong, mindfulSmall);
            const mindfulInput = document.createElement("input");
            mindfulInput.type = "checkbox";
            mindfulInput.checked = app.mindful;
            mindfulLabel.append(mindfulText, mindfulInput);

            const saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.className = "primary-button";
            saveButton.textContent = "Save app";
            saveButton.addEventListener("click", () => {
                const newName = cleanText(nameInput.value, 24);
                const newTarget = normalizeTargetInput(targetInput.value);

                if (!newName || !isSafeTarget(newTarget)) {
                    showToast("Enter a valid name and secure app link.");
                    return;
                }

                app.name = newName;
                app.symbol = cleanSymbol(symbolInput.value, newName.charAt(0).toUpperCase());
                app.target = newTarget;
                app.mindful = mindfulInput.checked;
                saveState();
                renderLauncher();
                renderAppSettings();
                showToast("App updated.");
            });

            const actions = document.createElement("div");
            actions.className = "editor-actions";
            const upButton = createEditorButton("Move up");
            const downButton = createEditorButton("Move down");
            const deleteButton = createEditorButton("Remove", "delete");
            upButton.disabled = index === 0;
            downButton.disabled = index === state.apps.length - 1;

            upButton.addEventListener("click", () => moveApp(index, index - 1));
            downButton.addEventListener("click", () => moveApp(index, index + 1));
            deleteButton.addEventListener("click", () => {
                if (!window.confirm(`Remove ${app.name} from Minimal?`)) return;
                state.apps = state.apps.filter((candidate) => candidate.id !== app.id);
                saveState();
                renderLauncher();
                renderAppSettings();
                showToast("App removed.");
            });

            actions.append(upButton, downButton, deleteButton);
            body.append(
                nameLabel,
                nameInput,
                symbolLabel,
                symbolInput,
                targetLabel,
                targetInput,
                mindfulLabel,
                saveButton,
                actions
            );
            editor.append(summary, body);
            elements.appSettingsList.append(editor);
        });
    }

    function moveApp(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= state.apps.length) return;
        const [app] = state.apps.splice(fromIndex, 1);
        state.apps.splice(toIndex, 0, app);
        saveState();
        renderLauncher();
        renderAppSettings();
    }

    function hydrateSettingsForm() {
        elements.nameInput.value = state.profile.name;
        elements.clockFormatSelect.value = state.profile.clock24 ? "24" : "12";
        elements.showSecondsInput.checked = state.profile.showSeconds;
        elements.accentSelect.value = state.profile.accent;
        document.documentElement.dataset.accent = state.profile.accent;

        const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
        elements.installStatus.textContent = standalone
            ? "Installed mode is active. Minimal is running as a Home Screen app."
            : "Browser mode is active. In Safari, use Share → Add to Home Screen.";
    }

    function renderAll() {
        document.documentElement.dataset.accent = state.profile.accent;
        renderPriority();
        renderLauncher();
        renderTasks();
        renderFocus();
        renderAppSettings();
        renderSummary();
        updateClock();
        updateConnectionStatus();
    }

    function openApp(app) {
        if (!isSafeTarget(app.target)) {
            showToast("That app link is not allowed.");
            return;
        }

        if (app.target === "minimal:call") {
            openModal("call");
            return;
        }

        if (app.mindful) {
            openIntentionModal(app);
            return;
        }

        launchTarget(app.target);
    }

    function launchTarget(target) {
        if (!isSafeTarget(target)) {
            showToast("That app link is not allowed.");
            return;
        }

        const link = document.createElement("a");
        link.href = target;
        link.rel = "noreferrer";
        link.setAttribute("aria-hidden", "true");
        document.body.append(link);
        link.click();
        link.remove();
    }

    function openIntentionModal(app) {
        pendingApp = app;
        elements.pendingAppName.textContent = app.name;
        elements.openingReasonInput.value = "";
        elements.continueAppButton.disabled = true;

        let seconds = 5;
        elements.continueAppButton.textContent = `Continue in ${seconds}`;
        openModal("intention");
        elements.openingReasonInput.focus();

        window.clearInterval(intentionCountdown);
        intentionCountdown = window.setInterval(() => {
            seconds -= 1;
            if (seconds > 0) {
                elements.continueAppButton.textContent = `Continue in ${seconds}`;
                return;
            }

            window.clearInterval(intentionCountdown);
            elements.continueAppButton.disabled = false;
            elements.continueAppButton.textContent = "Open app";
        }, 1000);
    }

    function openModal(modalName) {
        const modal = modalName === "call" ? elements.callModal : elements.intentionModal;
        modal.hidden = false;
        document.body.classList.add("modal-open");

        if (modalName === "call") {
            window.setTimeout(() => elements.phoneNumberInput.focus(), 50);
        }
    }

    function closeModal(modalName) {
        const modal = modalName === "call" ? elements.callModal : elements.intentionModal;
        modal.hidden = true;

        if (modalName === "intention") {
            window.clearInterval(intentionCountdown);
            pendingApp = null;
        }

        if (elements.callModal.hidden && elements.intentionModal.hidden) {
            document.body.classList.remove("modal-open");
        }
    }

    function exportData() {
        const exportState = {
            ...state,
            exportedAt: new Date().toISOString()
        };
        const file = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = `minimal-backup-${getDayKey()}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast("Backup created.");
    }

    async function importData(file) {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error("Backup is not an object.");
            }

            state = normalizeState(parsed);
            saveState();
            hydrateSettingsForm();
            renderAll();
            navigateTo("home");
            showToast("Backup imported.");
        } catch (error) {
            console.warn("Import failed.", error);
            showToast("That file is not a valid Minimal backup.");
        } finally {
            elements.importInput.value = "";
        }
    }

    function attachEventListeners() {
        elements.navigationButtons.forEach((button) => {
            button.addEventListener("click", () => navigateTo(button.dataset.go));
        });

        elements.editAppsButton.addEventListener("click", () => {
            navigateTo("settings");
            window.setTimeout(() => elements.appSettings.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        });

        elements.priorityForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const priority = cleanText(elements.priorityInput.value, 120);
            if (!priority) return;

            state.priority = priority;
            elements.priorityInput.value = "";
            saveState();
            renderPriority();
            renderTasks();
            showToast("Intention set.");
        });

        elements.clearPriorityButton.addEventListener("click", () => {
            state.priority = "";
            saveState();
            renderPriority();
            renderTasks();
        });

        elements.taskForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const text = cleanText(elements.taskInput.value, 140);
            const activeCount = state.tasks.filter((task) => !task.done).length;

            if (!text) return;
            if (activeCount >= MAX_TASKS) {
                showToast(`Keep it minimal: ${MAX_TASKS} active tasks maximum.`);
                return;
            }

            state.tasks.push({
                id: makeId("task"),
                text,
                done: false,
                createdAt: Date.now()
            });
            elements.taskInput.value = "";
            saveState();
            renderTasks();
        });

        elements.clearCompletedButton.addEventListener("click", () => {
            state.tasks = state.tasks.filter((task) => !task.done);
            saveState();
            renderTasks();
            showToast("Completed tasks cleared.");
        });

        elements.presetButtons.forEach((button) => {
            button.addEventListener("click", () => selectTimerDuration(button.dataset.minutes));
        });

        elements.startTimerButton.addEventListener("click", startOrPauseTimer);
        elements.resetTimerButton.addEventListener("click", resetTimer);

        elements.profileForm.addEventListener("submit", (event) => {
            event.preventDefault();
            state.profile.name = cleanText(elements.nameInput.value, 32);
            state.profile.clock24 = elements.clockFormatSelect.value === "24";
            state.profile.showSeconds = elements.showSecondsInput.checked;
            state.profile.accent = VALID_ACCENTS.has(elements.accentSelect.value) ? elements.accentSelect.value : "mono";
            saveState();
            hydrateSettingsForm();
            renderAll();
            showToast("Experience saved.");
        });

        elements.appForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (state.apps.length >= MAX_APPS) {
                showToast(`Keep only ${MAX_APPS} essential apps.`);
                return;
            }

            const name = cleanText(elements.appNameInput.value, 24);
            const target = normalizeTargetInput(elements.appTargetInput.value);

            if (!name || !isSafeTarget(target)) {
                showToast("Enter a valid name and secure app link.");
                return;
            }

            state.apps.push({
                id: makeId("app"),
                name,
                symbol: cleanSymbol(elements.appSymbolInput.value, name.charAt(0).toUpperCase()),
                target,
                mindful: elements.appMindfulInput.checked
            });

            elements.appForm.reset();
            saveState();
            renderLauncher();
            renderAppSettings();
            showToast("App added.");
        });

        elements.restoreAppsButton.addEventListener("click", () => {
            if (!window.confirm("Replace your launcher with the starter apps?")) return;
            state.apps = clone(DEFAULT_APPS);
            saveState();
            renderLauncher();
            renderAppSettings();
            showToast("Starter apps restored.");
        });

        elements.customTimerForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const minutes = Number(elements.customMinutesInput.value);
            if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
                showToast("Choose between 1 and 180 minutes.");
                return;
            }

            selectTimerDuration(minutes);
            elements.customMinutesInput.value = "";
            navigateTo("focus");
            showToast("Custom timer ready.");
        });

        elements.exportButton.addEventListener("click", exportData);
        elements.importButton.addEventListener("click", () => elements.importInput.click());
        elements.importInput.addEventListener("change", () => {
            const [file] = elements.importInput.files;
            if (file) importData(file);
        });

        elements.resetAllButton.addEventListener("click", () => {
            const confirmed = window.confirm("Erase every local task, setting, app, and focus count? This cannot be undone without a backup.");
            if (!confirmed) return;

            localStorage.removeItem(STORAGE_KEY);
            state = normalizeState(clone(DEFAULT_STATE));
            saveState();
            hydrateSettingsForm();
            renderAll();
            navigateTo("home");
            showToast("Minimal has been reset.");
        });

        elements.continueAppButton.addEventListener("click", () => {
            if (!pendingApp || elements.continueAppButton.disabled) return;
            const target = pendingApp.target;
            closeModal("intention");
            launchTarget(target);
        });

        document.querySelectorAll("[data-close-modal]").forEach((button) => {
            button.addEventListener("click", () => closeModal(button.dataset.closeModal));
        });

        elements.callForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const number = elements.phoneNumberInput.value.replace(/[^0-9+.-]/g, "");
            if (!number) {
                showToast("Enter a phone number.");
                return;
            }

            elements.phoneNumberInput.value = "";
            closeModal("call");
            launchTarget(`tel:${number}`);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            if (!elements.intentionModal.hidden) closeModal("intention");
            if (!elements.callModal.hidden) closeModal("call");
        });

        window.addEventListener("online", updateConnectionStatus);
        window.addEventListener("offline", updateConnectionStatus);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                updateClock();
                tickFocus();
            }
        });
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./service-worker.js").catch((error) => {
                console.warn("Offline mode could not start.", error);
            });
        });
    }

    function initialize() {
        attachEventListeners();
        hydrateSettingsForm();

        if (state.focus.running) {
            const remaining = getLiveRemaining();
            if (remaining <= 0) {
                completeFocusSession();
            } else {
                state.focus.remaining = remaining;
            }
        }

        renderAll();

        const requestedView = new URLSearchParams(window.location.search).get("view");
        navigateTo(VALID_VIEWS.has(requestedView) ? requestedView : "home", { keepUrl: true });

        window.setInterval(updateClock, 1000);
        window.setInterval(tickFocus, 500);
        registerServiceWorker();
    }

    initialize();
})();
