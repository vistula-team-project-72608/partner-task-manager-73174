// Task Manager – talks to the Supabase REST API with fetch()

let API = "";        // https://PROJECT_ID.supabase.co/rest/v1/tasks
let HEADERS = {};
let editingId = null;
let tasksCache = [];

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const el = $("status-message");
  el.textContent = message;
  el.className = isError ? "error" : "ok";
}

// Generic request helper with useful error messages
async function request(query, options = {}) {
  const res = await fetch(API + query, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.message || JSON.stringify(body);
    } catch (_) { /* no JSON body */ }
    throw new Error(`${res.status} – ${detail}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---- CRUD operations ----
const getTasks   = ()       => request("?select=*&order=id.asc");                         // GET all
const getTask    = (id)     => request(`?id=eq.${id}&select=*`).then((r) => r[0]);        // GET by id
const createTask = (task)   => request("", {                                              // POST
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify(task),
});
const updateTask = (id, changes) => request(`?id=eq.${id}`, {                             // PATCH
  method: "PATCH",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify(changes),
});
const deleteTask = (id)     => request(`?id=eq.${id}`, { method: "DELETE" });             // DELETE

// ---- Rendering ----
function renderTasks(tasks) {
  const list = $("task-list");
  list.innerHTML = "";

  if (tasks.length === 0) {
    list.textContent = "No tasks yet – add one above.";
    return;
  }

  for (const task of tasks) {
    const item = document.createElement("div");
    item.className = "task-item" + (task.completed ? " done" : "");
    item.dataset.id = task.id;

    const title = document.createElement("h3");
    title.className = "task-title";
    title.textContent = task.title;

    const desc = document.createElement("p");
    desc.className = "task-description";
    desc.textContent = task.description || "";

    const status = document.createElement("span");
    status.className = "task-status";
    status.textContent = task.completed ? "Completed" : "Not completed";

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      makeButton("edit-task", "Edit"),
      makeButton("toggle-task", task.completed ? "Mark incomplete" : "Mark complete"),
      makeButton("delete-task", "Delete")
    );

    item.append(title, desc, status, actions);
    list.appendChild(item);
  }
}

function makeButton(cls, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  return b;
}

async function loadTasks() {
  try {
    tasksCache = await getTasks();
    renderTasks(tasksCache);
  } catch (err) {
    setStatus("Could not load tasks: " + err.message, true);
  }
}

// ---- Form (create + edit) ----
function resetForm() {
  editingId = null;
  $("task-form").reset();
  $("task-submit").textContent = "Add task";
  $("cancel-edit").hidden = true;
}

$("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("task-title").value.trim();
  const description = $("task-description").value.trim();
  if (!title) {
    setStatus("Title is required.", true);
    return;
  }

  try {
    if (editingId !== null) {
      await updateTask(editingId, { title, description });
      setStatus("Task updated.");
    } else {
      await createTask({ title, description, completed: false });
      setStatus("Task added.");
    }
    resetForm();
    await loadTasks();
  } catch (err) {
    setStatus("Saving failed: " + err.message, true);
  }
});

$("cancel-edit").addEventListener("click", resetForm);

// ---- Buttons inside the task list ----
$("task-list").addEventListener("click", async (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const item = button.closest(".task-item");
  const id = Number(item.dataset.id);

  try {
    if (button.classList.contains("edit-task")) {
      const task = await getTask(id);
      editingId = id;
      $("task-title").value = task.title;
      $("task-description").value = task.description || "";
      $("task-submit").textContent = "Save changes";
      $("cancel-edit").hidden = false;
      $("task-title").focus();
      setStatus("Editing task #" + id);
    } else if (button.classList.contains("toggle-task")) {
      const task = tasksCache.find((t) => t.id === id);
      await updateTask(id, { completed: !task.completed });
      setStatus("Status changed.");
      await loadTasks();
    } else if (button.classList.contains("delete-task")) {
      if (!confirm("Delete this task?")) return;
      await deleteTask(id);
      if (editingId === id) resetForm();
      setStatus("Task deleted.");
      await loadTasks();
    }
  } catch (err) {
    setStatus("Operation failed: " + err.message, true);
  }
});

// ---- Start: read config.json, then load tasks ----
async function init() {
  try {
    const res = await fetch("config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("config.json not found");
    const cfg = await res.json();

    API = `${cfg.supabaseUrl.replace(/\/$/, "")}/rest/v1/${cfg.tableName}`;
    HEADERS = {
      apikey: cfg.supabasePublishableKey,
      "Content-Type": "application/json",
    };
    // Legacy "anon" keys are JWTs (start with eyJ) and also go in Authorization
    if (cfg.supabasePublishableKey.startsWith("eyJ")) {
      HEADERS.Authorization = "Bearer " + cfg.supabasePublishableKey;
    }

    await loadTasks();
  } catch (err) {
    setStatus("Configuration error: " + err.message, true);
  }
}

init();
