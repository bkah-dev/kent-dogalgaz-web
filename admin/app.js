const STAFF_EMAIL_SUFFIX = "@personel.kentmekanikdogalgaz.com";
const FILTER_KEY = "kent-is-filter";
const WARN_DAYS = 7;
const config = window.KENT_SUPABASE_CONFIG;

const state = {
  user: null,
  member: null,
  stages: [],
  jobs: [],
  events: [],
  filter: localStorage.getItem(FILTER_KEY) || "open",
  search: "",
  activeJobId: null,
  editingJobId: null,
  channel: null,
  reloadTimer: null,
};

const el = Object.fromEntries([
  "authGate", "loginForm", "loginUsername", "loginPassword", "loginError", "loginButton",
  "app", "listView", "detailView", "staffName", "stagesButton", "logoutButton",
  "searchInput", "stageChips", "syncStatus", "jobList", "emptyState", "newJobButton",
  "backButton", "detailTitle", "detailNo", "editJobButton", "callLink", "mapLink",
  "detailAddress", "detailNote", "stageCard", "stageName", "stageSince", "statusBanner",
  "nextStageButton", "pickStageButton", "appointmentInput", "saveAppointmentButton",
  "noteInput", "addNoteButton", "timeline", "cancelJobButton", "reopenJobButton",
  "overlay", "jobDialog", "jobDialogTitle", "fName", "fPhone", "fDistrict", "fAddress", "fNote",
  "fStageWrap", "fStage", "jobDialogError", "jobDialogCancel", "jobDialogSave",
  "stagePicker", "stagePickerList", "stagePickerCancel",
  "stagesDialog", "stagesList", "stagesClose", "toast"
].map((id) => [id, document.getElementById(id)]));

const db = window.supabase.createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortDateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function normalizeText(value) {
  return (value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function daysLabel(iso) {
  const d = daysSince(iso);
  if (d <= 0) return "bugün";
  if (d === 1) return "1 gün";
  return `${d} gün`;
}

function phoneHref(phone) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function mapsHref(job) {
  const q = [job.address, job.district].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let toastTimer = null;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("error", isError);
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 4000 : 2200);
}

function friendlyError(error) {
  const msg = error?.message || String(error);
  if (/Invalid login credentials/i.test(msg)) return "Kullanıcı adı veya parola hatalı.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Bağlantı yok. İnterneti kontrol edin.";
  return msg.replace(/^.*?exception:\s*/i, "");
}

function stageById(id) {
  return state.stages.find((s) => s.id === id) || null;
}

function activeStages() {
  return state.stages.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

function nextStage(currentId) {
  const list = activeStages();
  const idx = list.findIndex((s) => s.id === currentId);
  if (idx === -1) return list[0] || null;
  return list[idx + 1] || null;
}

function openSheet(sheet) {
  el.overlay.hidden = false;
  sheet.hidden = false;
}

function closeSheets() {
  el.overlay.hidden = true;
  [el.jobDialog, el.stagePicker, el.stagesDialog].forEach((s) => { s.hidden = true; });
}

// ---------------------------------------------------------------------------
// Veri yükleme
// ---------------------------------------------------------------------------
async function loadStages() {
  const { data, error } = await db.from("job_stages").select("*").order("sort_order");
  if (error) throw error;
  state.stages = data || [];
}

async function loadJobs() {
  el.syncStatus.textContent = "Yükleniyor…";
  const { data, error } = await db.from("jobs_view").select("*").order("updated_at", { ascending: false }).limit(1000);
  if (error) { el.syncStatus.textContent = "Liste alınamadı: " + friendlyError(error); throw error; }
  state.jobs = data || [];
  el.syncStatus.textContent = "";
  renderChips();
  renderList();
  if (state.activeJobId) renderDetail();
}

async function loadEvents(jobId) {
  const { data, error } = await db.from("job_events_view").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  state.events = data || [];
}

function scheduleReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(() => loadJobs().catch(() => {}), 400);
}

function subscribeRealtime() {
  if (state.channel) return;
  state.channel = db
    .channel("jobs-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, scheduleReload)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
function filteredJobs() {
  const q = normalizeText(state.search.trim());
  return state.jobs.filter((job) => {
    if (state.filter === "open" && job.status !== "open") return false;
    if (state.filter === "closed" && job.status === "open") return false;
    if (/^stage:/.test(state.filter)) {
      if (job.status !== "open" || String(job.stage_id) !== state.filter.slice(6)) return false;
    }
    if (!q) return true;
    const hay = normalizeText(`${job.customer_name} ${job.phone} ${job.address} ${job.district} ${job.note} #${job.job_no}`);
    return hay.includes(q);
  });
}

function renderChips() {
  const open = state.jobs.filter((j) => j.status === "open");
  const closed = state.jobs.length - open.length;
  const chips = [
    { key: "open", label: "Açık işler", count: open.length },
    ...activeStages()
      .filter((s) => !s.is_terminal)
      .map((s) => ({ key: `stage:${s.id}`, label: s.short_name || s.name, count: open.filter((j) => j.stage_id === s.id).length })),
    { key: "closed", label: "Biten / iptal", count: closed },
  ];
  el.stageChips.innerHTML = chips
    .filter((c) => c.key === "open" || c.key === "closed" || c.count > 0)
    .map((c) => `<button type="button" class="chip${state.filter === c.key ? " active" : ""}" data-filter="${c.key}">${escapeHtml(c.label)}<span class="count">${c.count}</span></button>`)
    .join("");
  if (!chips.some((c) => c.key === state.filter && (c.count > 0 || c.key === "open" || c.key === "closed"))) {
    state.filter = "open";
    localStorage.setItem(FILTER_KEY, state.filter);
    el.stageChips.querySelector('[data-filter="open"]')?.classList.add("active");
  }
}

function renderList() {
  const jobs = filteredJobs();
  el.emptyState.hidden = jobs.length > 0;
  el.jobList.innerHTML = jobs.map((job) => {
    const days = daysSince(job.stage_changed_at);
    const warn = job.status === "open" && !job.stage_is_terminal && days >= WARN_DAYS;
    const sub = [job.district, job.address].filter(Boolean).join(" · ") || job.phone || "—";
    const appt = job.appointment_at && job.status === "open" ? `<span class="appt">📅 ${shortDateFmt.format(new Date(job.appointment_at))}</span>` : "";
    const tel = phoneHref(job.phone);
    return `
      <article class="job-card ${job.status}" data-id="${job.id}" style="border-left-color:${escapeHtml(job.stage_color)}">
        <div class="name">${escapeHtml(job.customer_name)} <small style="color:var(--muted);font-weight:600">#${job.job_no}</small></div>
        <div class="sub">${escapeHtml(sub)}</div>
        <div class="meta">
          <span class="badge" style="background:${escapeHtml(job.stage_color)}">${escapeHtml(job.status === "cancelled" ? "İptal" : job.stage_short_name || job.stage_name)}</span>
          <span class="days${warn ? " warn" : ""}">${daysLabel(job.stage_changed_at)}</span>
          ${appt}
        </div>
        ${tel ? `<a class="call" href="${tel}" data-call aria-label="Ara">📞</a>` : ""}
      </article>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Detay
// ---------------------------------------------------------------------------
async function openDetail(jobId) {
  state.activeJobId = jobId;
  el.listView.hidden = true;
  el.detailView.hidden = false;
  window.scrollTo(0, 0);
  state.events = [];
  renderDetail();
  try {
    await loadEvents(jobId);
    renderTimeline();
  } catch (error) {
    toast("Geçmiş alınamadı: " + friendlyError(error), true);
  }
}

function closeDetail() {
  state.activeJobId = null;
  el.detailView.hidden = true;
  el.listView.hidden = false;
}

function renderDetail() {
  const job = state.jobs.find((j) => j.id === state.activeJobId);
  if (!job) { closeDetail(); return; }

  el.detailTitle.textContent = job.customer_name;
  el.detailNo.textContent = `#${job.job_no}${job.phone ? " · " + job.phone : ""}`;

  const tel = phoneHref(job.phone);
  el.callLink.href = tel || "#";
  el.callLink.setAttribute("aria-disabled", tel ? "false" : "true");
  const maps = mapsHref(job);
  el.mapLink.href = maps || "#";
  el.mapLink.setAttribute("aria-disabled", maps ? "false" : "true");

  el.detailAddress.textContent = [job.district, job.address].filter(Boolean).join(" · ");
  el.detailNote.textContent = job.note || "";

  el.stageCard.style.borderLeftColor = job.stage_color;
  el.stageName.textContent = job.stage_name;
  el.stageSince.textContent = `${daysLabel(job.stage_changed_at)} önce · ${dateFmt.format(new Date(job.stage_changed_at))}`;

  const isOpen = job.status === "open";
  el.statusBanner.hidden = isOpen;
  el.statusBanner.className = "status-banner " + job.status;
  el.statusBanner.textContent = job.status === "cancelled" ? "Bu iş iptal edildi." : "Bu iş tamamlandı.";

  const next = nextStage(job.stage_id);
  el.nextStageButton.hidden = !isOpen || !next;
  if (next) {
    el.nextStageButton.textContent = `→ ${next.name}`;
    el.nextStageButton.dataset.stageId = next.id;
  }
  el.pickStageButton.hidden = !isOpen;
  el.cancelJobButton.hidden = !isOpen;
  el.reopenJobButton.hidden = isOpen;

  el.appointmentInput.value = toLocalInputValue(job.appointment_at);
}

function renderTimeline() {
  el.timeline.innerHTML = state.events.map((ev) => {
    let text = "";
    if (ev.kind === "created") text = `İş açıldı · ${ev.to_stage_name || ""}`;
    else if (ev.kind === "stage") text = `${ev.from_stage_name || "—"} → ${ev.to_stage_name || "—"}${ev.note ? " · " + ev.note : ""}`;
    else if (ev.kind === "note") text = ev.note;
    else if (ev.kind === "appointment") text = `Randevu: ${ev.note}`;
    else text = ev.note;
    return `<li class="${ev.kind}">
      <span class="tl-text">${escapeHtml(text)}</span>
      <span class="tl-meta">${dateFmt.format(new Date(ev.created_at))}${ev.created_by_name ? " · " + escapeHtml(ev.created_by_name) : ""}</span>
    </li>`;
  }).join("") || '<li class="note"><span class="tl-meta">Henüz kayıt yok.</span></li>';
}

async function changeStage(stageId, note = "") {
  const job = state.jobs.find((j) => j.id === state.activeJobId);
  if (!job) return;
  el.nextStageButton.disabled = true;
  try {
    const { error } = await db.rpc("set_job_stage", { p_job_id: job.id, p_stage_id: stageId, p_note: note });
    if (error) throw error;
    toast(`${stageById(stageId)?.name || "Aşama"} ✓`);
    await loadJobs();
    await loadEvents(job.id);
    renderTimeline();
  } catch (error) {
    toast(friendlyError(error), true);
  } finally {
    el.nextStageButton.disabled = false;
  }
}

function openStagePicker() {
  const job = state.jobs.find((j) => j.id === state.activeJobId);
  if (!job) return;
  el.stagePickerList.innerHTML = activeStages().map((s, i) => `
    <button type="button" class="stage-option${s.id === job.stage_id ? " current" : ""}" data-stage="${s.id}">
      <span class="idx">${i + 1}</span>
      <span class="dot" style="background:${escapeHtml(s.color)}"></span>
      <span>${escapeHtml(s.name)}</span>
    </button>`).join("");
  openSheet(el.stagePicker);
}

// ---------------------------------------------------------------------------
// Yeni / düzenle
// ---------------------------------------------------------------------------
function openJobDialog(job = null) {
  state.editingJobId = job?.id || null;
  el.jobDialogTitle.textContent = job ? "İşi düzenle" : "Yeni iş";
  el.fName.value = job?.customer_name || "";
  el.fPhone.value = job?.phone || "";
  el.fDistrict.value = job?.district || "";
  el.fAddress.value = job?.address || "";
  el.fNote.value = job?.note || "";
  el.jobDialogError.textContent = "";
  el.fStageWrap.hidden = Boolean(job);
  if (!job) {
    el.fStage.innerHTML = activeStages().filter((s) => !s.is_terminal).map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
  openSheet(el.jobDialog);
  setTimeout(() => el.fName.focus(), 50);
}

async function saveJobDialog(event) {
  event.preventDefault();
  el.jobDialogSave.disabled = true;
  el.jobDialogError.textContent = "";
  const payload = {
    p_customer_name: el.fName.value.trim(),
    p_phone: el.fPhone.value.trim(),
    p_address: el.fAddress.value.trim(),
    p_district: el.fDistrict.value.trim(),
    p_note: el.fNote.value.trim(),
  };
  try {
    if (state.editingJobId) {
      const { error } = await db.rpc("update_job_info", { p_job_id: state.editingJobId, ...payload });
      if (error) throw error;
      toast("Bilgiler güncellendi");
      closeSheets();
      await loadJobs();
      await loadEvents(state.editingJobId);
      renderTimeline();
    } else {
      const { data, error } = await db.rpc("create_job", { ...payload, p_stage_id: Number(el.fStage.value) });
      if (error) throw error;
      toast("İş açıldı");
      closeSheets();
      await loadJobs();
      if (data) openDetail(data);
    }
  } catch (error) {
    el.jobDialogError.textContent = friendlyError(error);
  } finally {
    el.jobDialogSave.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Aşama yönetimi (admin)
// ---------------------------------------------------------------------------
function renderStagesAdmin() {
  const list = [...state.stages].sort((a, b) => a.sort_order - b.sort_order);
  el.stagesList.innerHTML = list.map((s, i) => `
    <div class="stage-row${s.is_active ? "" : " inactive"}" data-stage="${s.id}">
      <input type="text" value="${escapeHtml(s.name)}" data-field="name" maxlength="60">
      <button type="button" class="mini" data-act="up" ${i === 0 ? "disabled" : ""} title="Yukarı">↑</button>
      <button type="button" class="mini" data-act="down" ${i === list.length - 1 ? "disabled" : ""} title="Aşağı">↓</button>
      <button type="button" class="mini" data-act="toggle" title="${s.is_active ? "Pasife al" : "Aktif et"}">${s.is_active ? "👁" : "🚫"}</button>
    </div>`).join("");
}

async function updateStage(id, patch) {
  const { error } = await db.from("job_stages").update(patch).eq("id", id);
  if (error) { toast(friendlyError(error), true); return; }
  await loadStages();
  renderStagesAdmin();
  renderChips();
  renderList();
}

async function handleStagesAdminClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  const row = btn.closest("[data-stage]");
  const id = Number(row.dataset.stage);
  const list = [...state.stages].sort((a, b) => a.sort_order - b.sort_order);
  const idx = list.findIndex((s) => s.id === id);
  if (btn.dataset.act === "toggle") {
    await updateStage(id, { is_active: !list[idx].is_active });
  } else {
    const swapWith = list[btn.dataset.act === "up" ? idx - 1 : idx + 1];
    if (!swapWith) return;
    const a = list[idx];
    const first = await db.from("job_stages").update({ sort_order: swapWith.sort_order }).eq("id", a.id);
    const second = first.error ? first : await db.from("job_stages").update({ sort_order: a.sort_order }).eq("id", swapWith.id);
    if (second.error) toast(friendlyError(second.error), true);
    await loadStages();
    renderStagesAdmin();
    renderChips();
    renderList();
  }
}

async function handleStageRename(event) {
  const input = event.target.closest('[data-field="name"]');
  if (!input) return;
  const id = Number(input.closest("[data-stage]").dataset.stage);
  const name = input.value.trim();
  const current = stageById(id);
  if (!name || !current || name === current.name) return;
  await updateStage(id, { name, short_name: name.length <= 14 ? name : current.short_name });
  toast("Aşama adı güncellendi");
}

// ---------------------------------------------------------------------------
// Oturum
// ---------------------------------------------------------------------------
async function login(event) {
  event.preventDefault();
  el.loginError.textContent = "";
  el.loginButton.disabled = true;
  const username = el.loginUsername.value.trim();
  const email = username.includes("@") ? username : username.toLocaleLowerCase("tr-TR") + STAFF_EMAIL_SUFFIX;
  try {
    const { error } = await db.auth.signInWithPassword({ email, password: el.loginPassword.value });
    if (error) throw error;
  } catch (error) {
    el.loginError.textContent = friendlyError(error);
  } finally {
    el.loginButton.disabled = false;
  }
}

async function applySession(session) {
  state.user = session?.user || null;
  if (!state.user) {
    el.app.hidden = true;
    el.authGate.hidden = false;
    state.member = null;
    if (state.channel) { await db.removeChannel(state.channel); state.channel = null; }
    return;
  }
  const { data: member, error } = await db.from("staff_members").select("user_id,display_name,role").eq("user_id", state.user.id).maybeSingle();
  if (error || !member) {
    el.loginError.textContent = error ? "Veritabanı kurulumu tamamlanmamış: " + friendlyError(error) : "Bu hesap personel olarak yetkilendirilmemiş.";
    await db.auth.signOut();
    return;
  }
  state.member = member;
  el.staffName.textContent = member.display_name || state.user.email;
  el.stagesButton.hidden = member.role !== "admin";
  el.authGate.hidden = true;
  el.app.hidden = false;
  el.loginPassword.value = "";
  try {
    await loadStages();
    await loadJobs();
    subscribeRealtime();
  } catch (error) {
    toast(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------------
// Olaylar
// ---------------------------------------------------------------------------
el.loginForm.addEventListener("submit", login);
el.logoutButton.addEventListener("click", () => db.auth.signOut());

el.searchInput.addEventListener("input", () => { state.search = el.searchInput.value; renderList(); });
el.stageChips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if (!chip) return;
  state.filter = chip.dataset.filter;
  localStorage.setItem(FILTER_KEY, state.filter);
  renderChips();
  renderList();
});
el.jobList.addEventListener("click", (event) => {
  if (event.target.closest("[data-call]")) return;
  const card = event.target.closest("[data-id]");
  if (card) openDetail(card.dataset.id);
});
el.newJobButton.addEventListener("click", () => openJobDialog());

el.backButton.addEventListener("click", closeDetail);
el.editJobButton.addEventListener("click", () => openJobDialog(state.jobs.find((j) => j.id === state.activeJobId)));
el.nextStageButton.addEventListener("click", () => changeStage(Number(el.nextStageButton.dataset.stageId)));
el.pickStageButton.addEventListener("click", openStagePicker);
el.stagePickerList.addEventListener("click", (event) => {
  const opt = event.target.closest("[data-stage]");
  if (!opt) return;
  closeSheets();
  changeStage(Number(opt.dataset.stage));
});
el.stagePickerCancel.addEventListener("click", closeSheets);

el.saveAppointmentButton.addEventListener("click", async () => {
  const value = el.appointmentInput.value;
  const iso = value ? new Date(value).toISOString() : null;
  const { error } = await db.rpc("set_job_appointment", { p_job_id: state.activeJobId, p_appointment_at: iso });
  if (error) { toast(friendlyError(error), true); return; }
  toast(iso ? "Randevu kaydedildi" : "Randevu kaldırıldı");
  await loadJobs();
  await loadEvents(state.activeJobId);
  renderTimeline();
});

async function addNote() {
  const note = el.noteInput.value.trim();
  if (!note) return;
  el.addNoteButton.disabled = true;
  const { error } = await db.from("job_events").insert({ job_id: state.activeJobId, kind: "note", note, created_by: state.user.id });
  el.addNoteButton.disabled = false;
  if (error) { toast(friendlyError(error), true); return; }
  el.noteInput.value = "";
  toast("Not eklendi");
  await loadEvents(state.activeJobId);
  renderTimeline();
  scheduleReload();
}
el.addNoteButton.addEventListener("click", addNote);
el.noteInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addNote(); } });

el.cancelJobButton.addEventListener("click", async () => {
  const reason = window.prompt("İptal sebebi (isteğe bağlı):", "");
  if (reason === null) return;
  const { error } = await db.rpc("set_job_status", { p_job_id: state.activeJobId, p_status: "cancelled", p_note: reason });
  if (error) { toast(friendlyError(error), true); return; }
  toast("İş iptal edildi");
  await loadJobs();
  await loadEvents(state.activeJobId);
  renderTimeline();
});
el.reopenJobButton.addEventListener("click", async () => {
  const { error } = await db.rpc("set_job_status", { p_job_id: state.activeJobId, p_status: "open", p_note: "" });
  if (error) { toast(friendlyError(error), true); return; }
  toast("İş yeniden açıldı");
  await loadJobs();
  await loadEvents(state.activeJobId);
  renderTimeline();
});

el.jobDialog.addEventListener("submit", saveJobDialog);
el.jobDialogCancel.addEventListener("click", closeSheets);
el.overlay.addEventListener("click", closeSheets);

el.stagesButton.addEventListener("click", () => { renderStagesAdmin(); openSheet(el.stagesDialog); });
el.stagesClose.addEventListener("click", closeSheets);
el.stagesList.addEventListener("click", handleStagesAdminClick);
el.stagesList.addEventListener("change", handleStageRename);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.user) scheduleReload();
});

db.auth.onAuthStateChange((_event, session) => setTimeout(() => applySession(session), 0));
db.auth.getSession().then(({ data }) => applySession(data.session));
