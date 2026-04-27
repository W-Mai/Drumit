import { defaultDrumtab } from "./data/examples.js";
import { parseDrumtab } from "./format/parser.js";
import { validateScore } from "./format/validate.js";
import { renderGrid } from "./renderer/gridRenderer.js";
import { renderStaff } from "./renderer/staffRenderer.js";

const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const diagnostics = document.querySelector("#diagnostics");
const astOutput = document.querySelector("#ast-output");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const loadExample = document.querySelector("#load-example");

let currentView = "grid";

editor.value = defaultDrumtab;
editor.addEventListener("input", render);
loadExample.addEventListener("click", () => {
  editor.value = defaultDrumtab;
  render();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    viewButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

render();

function render() {
  const parsed = parseDrumtab(editor.value);
  const validation = validateScore(parsed.score);
  const messages = [...parsed.diagnostics, ...validation];
  const hasErrors = messages.some((item) => item.level === "error");

  diagnostics.innerHTML = renderDiagnostics(messages);
  astOutput.textContent = JSON.stringify(parsed.score, null, 2);

  if (hasErrors) {
    preview.innerHTML = `<div class="empty-state">Fix parse errors to update the preview.</div>`;
    return;
  }

  preview.innerHTML = currentView === "staff" ? renderStaff(parsed.score) : renderGrid(parsed.score);
}

function renderDiagnostics(messages) {
  if (!messages.length) return `<div class="diagnostic ok">No diagnostics.</div>`;
  return messages
    .map((item) => `<div class="diagnostic ${item.level}"><strong>${item.level}</strong> line ${item.line}: ${escapeHtml(item.message)}</div>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
