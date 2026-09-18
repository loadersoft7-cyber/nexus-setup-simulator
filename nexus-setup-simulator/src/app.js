(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    step: 0,
    paused: false,
    timer: null,
    progress: 0,
    bytes: 0,
    sizeMB: 0,
    version: "",
    path: "",
    startedAt: 0,
    displayDuration: 0,
    speed: 0,
    logs: 0,
    phases: [],
    session: null,
  };

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }
  function pick(list) {
    return list[randInt(0, list.length - 1)];
  }

  function formatMB(n) {
    if (n >= 1000) return `${(n / 1024).toFixed(2)} GB`;
    if (n >= 100) return `${n.toFixed(0)} MB`;
    return `${n.toFixed(1)} MB`;
  }

  function formatTime(seconds) {
    const s = Math.max(1, Math.round(seconds));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }

  function newSession() {
    const major = randInt(1, 5);
    const minor = randInt(0, 12);
    const patch = randInt(0, 9);
    const channel = pick(["stable", "stable", "stable", "lts", "beta", "rc1"]);
    const sizeMB = Number(rand(168, 886).toFixed(0));
    const drive = pick(["C:", "D:", "C:", "D:", "E:"]);
    const folder = pick([
      `${drive}/Apps/Halcyon/Nexus`,
      `${drive}/Program Files/Halcyon/Nexus`,
      `${drive}/Tools/Nexus`,
      `${drive}/Workspaces/Nexus`,
    ]);

    // Visual duration of the fake unpack: 11–24 seconds of real time.
    const visualSeconds = rand(11, 24);
    // Reported "install time" on the done screen is independently varied
    // so every run looks different, while staying in a believable band.
    const reportedSeconds = randInt(18, 97);

    return {
      publisher: "Halcyon Works",
      version: `v${major}.${minor}.${patch}-${channel}`,
      sizeMB,
      path: folder,
      visualSeconds,
      reportedSeconds,
      avgSpeed: Number((sizeMB / visualSeconds).toFixed(1)),
    };
  }

  function applySession(session) {
    state.session = session;
    state.sizeMB = session.sizeMB;
    state.version = session.version;
    state.path = session.path;
    $("pkgPublisher").textContent = session.publisher;
    $("pkgVersion").textContent = session.version;
    $("pkgSize").textContent = formatMB(session.sizeMB);
    $("installPath").value = session.path;
    $("pathEcho").textContent = session.path;
  }

  function setStep(n) {
    state.step = n;
    document.querySelectorAll(".step").forEach((el) => {
      const idx = Number(el.dataset.step);
      el.classList.toggle("is-active", idx === n);
      el.classList.toggle("is-done", idx < n);
    });
    $("panel-welcome").classList.toggle("hidden", n !== 0);
    $("panel-options").classList.toggle("hidden", n !== 1);
    $("panel-install").classList.toggle("hidden", n !== 2);
    $("panel-done").classList.toggle("hidden", n !== 3);
  }

  function log(text) {
    state.logs += 1;
    const line = document.createElement("div");
    line.className = "log-line";
    line.innerHTML = `<span class="prompt">$</span>${text}`;
    $("logBody").appendChild(line);
    $("logBody").scrollTop = $("logBody").scrollHeight;
    $("logCount").textContent = `${state.logs} ${state.logs === 1 ? "ENTRY" : "ENTRIES"}`;
  }

  function resetInstallUI() {
    state.paused = false;
    state.progress = 0;
    state.bytes = 0;
    state.logs = 0;
    $("logBody").innerHTML = "";
    $("barFill").style.width = "0%";
    $("phasePct").textContent = "0%";
    $("phaseName").textContent = "Preparing";
    $("statSpeed").textContent = "0.0 MB/s";
    $("statDone").textContent = `0 / ${Math.round(state.sizeMB)} MB`;
    $("statStatus").textContent = "Working";
    $("etaLabel").innerHTML = $("etaLabel").innerHTML.replace(/ETA.*/, "ETA —");
    $("btnPause").textContent = "Pause";
    $("btnPause").disabled = false;
  }

  const PHASES = [
    { at: 0, name: "Verifying package", log: "Checking payload signature…" },
    { at: 6, name: "Unpacking archive", log: "Unpacking archive…" },
    { at: 28, name: "Writing files", log: "Expanding payload into destination…" },
    { at: 52, name: "Linking components", log: "Registering workspace modules…" },
    { at: 74, name: "Applying options", log: "Writing local preferences…" },
    { at: 88, name: "Integrity sweep", log: "Running integrity check…" },
    { at: 96, name: "Finalizing", log: "Closing transaction…" },
  ];

  function startInstall() {
    const path = $("installPath").value.trim() || state.path;
    state.path = path;
    $("pathEcho").textContent = path;
    resetInstallUI();
    setStep(2);
    state.startedAt = performance.now();
    log("Session opened. No network fetch required.");
    log(`Target ${path}`);
    log("Verifying local bundle…");

    let lastPhase = -1;
    const tick = () => {
      if (state.paused) return;
      const elapsed = (performance.now() - state.startedAt) / 1000;
      const duration = state.session.visualSeconds;
      // Ease-out so the bar doesn't look linear.
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 1.35);
      state.progress = eased * 100;

      const jitter = 1 + Math.sin(elapsed * 2.1) * 0.16 + (Math.random() - 0.5) * 0.08;
      const speed = Math.max(1.1, state.session.avgSpeed * jitter);
      state.speed = speed;
      const completed = Math.min(state.sizeMB, (state.progress / 100) * state.sizeMB);
      const remaining = Math.max(0, (1 - t) * duration);

      $("barFill").style.width = `${state.progress.toFixed(2)}%`;
      $("phasePct").textContent = `${Math.floor(state.progress)}%`;
      $("statSpeed").textContent = `${speed.toFixed(1)} MB/s`;
      $("statDone").textContent = `${Math.floor(completed)} / ${Math.round(state.sizeMB)} MB`;
      $("statStatus").textContent = "Working";
      $("etaLabel").innerHTML = `
        <span class="eta-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
            <path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        ETA ~${Math.max(1, Math.ceil(remaining))}s`;

      for (let i = 0; i < PHASES.length; i++) {
        if (state.progress >= PHASES[i].at && i > lastPhase) {
          lastPhase = i;
          $("phaseName").textContent = PHASES[i].name;
          log(PHASES[i].log);
        }
      }

      if (t >= 1) {
        clearInterval(state.timer);
        $("phaseName").textContent = "Complete";
        $("phasePct").textContent = "100%";
        $("barFill").style.width = "100%";
        $("statSpeed").textContent = "0.0 MB/s";
        $("statDone").textContent = `${Math.round(state.sizeMB)} / ${Math.round(state.sizeMB)} MB`;
        $("statStatus").textContent = "Finished";
        $("etaLabel").lastChild && ($("etaLabel").childNodes[$("etaLabel").childNodes.length - 1].textContent = " ETA 0s");
        log("Integrity check passed.");
        log("Setup transaction closed.");
        setTimeout(showDone, 550);
      }
    };

    state.timer = setInterval(tick, 120);
    tick();
  }

  function showDone() {
    $("sumPath").textContent = state.path;
    $("sumVersion").textContent = state.version;
    $("sumTime").textContent = formatTime(state.session.reportedSeconds);
    $("sumSize").textContent = formatMB(state.sizeMB);
    $("sumIntegrity").textContent = "Passed";
    setStep(3);
  }

  function replay() {
    if (state.timer) clearInterval(state.timer);
    applySession(newSession());
    setStep(0);
  }

  function closeApp() {
    if (window.nexus && window.nexus.close) {
      window.nexus.close();
      return;
    }
    window.close();
  }

  $("btnStart").addEventListener("click", () => setStep(1));
  $("btnBackWelcome").addEventListener("click", () => setStep(0));
  $("btnIncluded").addEventListener("click", () => $("includedModal").classList.remove("hidden"));
  $("btnCloseIncluded").addEventListener("click", () => $("includedModal").classList.add("hidden"));
  $("includedModal").addEventListener("click", (e) => {
    if (e.target === $("includedModal")) $("includedModal").classList.add("hidden");
  });

  $("btnInstall").addEventListener("click", () => {
    if (!$("optLicense").checked) {
      $("optLicense").parentElement.style.color = "#e07a6a";
      return;
    }
    startInstall();
  });

  $("btnCancelOptions").addEventListener("click", closeApp);
  $("btnCloseDone").addEventListener("click", closeApp);
  $("btnReplay").addEventListener("click", replay);

  $("btnPause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("btnPause").textContent = state.paused ? "Resume" : "Pause";
    $("statStatus").textContent = state.paused ? "Paused" : "Working";
    if (!state.paused) {
      // Shift start so remaining time stays consistent.
      const duration = state.session.visualSeconds;
      const doneRatio = state.progress / 100;
      state.startedAt = performance.now() - doneRatio * duration * 1000;
    }
  });

  $("btnLaunch").addEventListener("click", () => $("launchToast").classList.remove("hidden"));
  $("btnToastOk").addEventListener("click", () => $("launchToast").classList.add("hidden"));

  $("btnMin").addEventListener("click", () => window.nexus && window.nexus.minimize && window.nexus.minimize());
  $("btnMax").addEventListener("click", () => window.nexus && window.nexus.maximize && window.nexus.maximize());
  $("btnClose").addEventListener("click", closeApp);

  applySession(newSession());
  setStep(0);
})();
