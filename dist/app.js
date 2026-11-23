const pageMeta = {
  today: ["PONDĚLÍ · 23. LISTOPADU", "Dobré ráno, Martine"],
  plan: ["TVŮJ TÝDEN", "Jídelní plán"],
  fridge: ["ZÁSOBY A ČERSTVOST", "Moje kuchyň"],
  shopping: ["PLÁN → KOŠÍK", "Chytrý nákup"],
  insights: ["TRENDY, NE TLAK", "Můj pokrok"]
};

const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.querySelector("p").textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function openSection(section) {
  document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.dataset.page === section));
  document.querySelectorAll("[data-section]").forEach(button => button.classList.toggle("active", button.dataset.section === section));
  document.querySelector("#page-kicker").textContent = pageMeta[section][0];
  document.querySelector("#page-title").textContent = pageMeta[section][1];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => openSection(button.dataset.section)));

document.querySelectorAll("[data-scroll]").forEach(button => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: "smooth", block: "start" });
}));

document.querySelectorAll(".meal-check").forEach(button => button.addEventListener("click", () => {
  const item = button.closest(".meal-item");
  item.classList.toggle("completed");
  button.textContent = item.classList.contains("completed") ? "✓" : "○";
  const complete = document.querySelectorAll(".meal-item.completed").length;
  document.querySelector("#done-count").textContent = complete;
  document.querySelector("#meal-progress").style.width = `${complete * 25}%`;
  showToast(item.classList.contains("completed") ? "Jídlo je zaznamenané. Bez dalšího vyplňování." : "Jídlo bylo vráceno do dnešního plánu.");
}));

document.querySelectorAll(".day-strip > button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".day-strip > button").forEach(day => day.classList.remove("selected"));
  button.classList.add("selected");
  showToast(`Zobrazen plán pro ${button.querySelector("span").textContent.toLowerCase()} ${button.querySelector("strong").textContent}. listopadu.`);
}));

document.querySelectorAll(".retailer-toggle button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".retailer-toggle button").forEach(store => store.classList.remove("active"));
  button.classList.add("active");
  showToast(`Preferovaný obchod změněn na ${button.textContent.trim()}.`);
}));

document.querySelectorAll(".store-choice").forEach(choice => choice.addEventListener("click", () => {
  document.querySelectorAll(".store-choice").forEach(store => { store.classList.remove("active"); store.querySelector("i").textContent = "○"; });
  choice.classList.add("active");
  choice.querySelector("i").textContent = "✓";
  const name = choice.querySelector("strong").textContent;
  document.querySelector("#handoff-cart").textContent = `Naplnit košík na ${name === "Rohlík" ? "Rohlíku" : "Košíku"}`;
}));

document.querySelectorAll(".filter-chips button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter-chips button").forEach(filter => filter.classList.remove("active"));
  button.classList.add("active");
}));

document.querySelector("#sync-button").addEventListener("click", event => {
  event.currentTarget.querySelector("span:last-child").textContent = "Synchronizuji…";
  setTimeout(() => { event.currentTarget.querySelector("span:last-child").textContent = "Data aktuální"; showToast("Zásoby, plán i ceny jsou aktuální."); }, 850);
});

document.querySelector("#scan-fridge").addEventListener("click", () => showToast("Demo skenu: fotografie by se v backendu odeslala k rozpoznání položek a množství."));
document.querySelector("#use-up-button").addEventListener("click", () => { openSection("plan"); showToast("Do plánu jsme přednostně zařadili maliny, avokádo a špenát."); });
document.querySelector("#prepare-cart").addEventListener("click", () => { openSection("shopping"); showToast("Seznam je připravený k předání do zvoleného obchodu."); });
document.querySelector("#handoff-cart").addEventListener("click", event => showToast(`${event.currentTarget.textContent.replace("Naplnit", "Košík by se naplnil")} — následuje tvoje kontrola.`));
document.querySelector("#rebuild-cart").addEventListener("click", () => showToast("Nákup přepočítán: plán − zásoby doma = 11 položek."));
document.querySelector("#regenerate-plan").addEventListener("click", event => {
  const original = event.currentTarget.textContent;
  event.currentTarget.textContent = "Skládám lepší týden…";
  setTimeout(() => { event.currentTarget.textContent = original; showToast("Týden přestavěn: méně vaření, stejný cíl, využité zásoby."); }, 1050);
});
document.querySelector("#prep-guide").addEventListener("click", () => showToast("Průvodce připraví časovou osu trouby, vaření a porcování."));
document.querySelector("#search-button").addEventListener("click", () => showToast("Hledání receptů, surovin a jídelních plánů bude napojeno na backend."));

const modal = document.querySelector("#modal-backdrop");
document.querySelector("#swap-day").addEventListener("click", () => { modal.hidden = false; });
document.querySelector("#modal-close").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", event => { if (event.target === modal) modal.hidden = true; });
document.querySelectorAll(".modal-options button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".modal-options button").forEach(option => option.classList.remove("selected"));
  button.classList.add("selected");
}));
document.querySelector("#modal-apply").addEventListener("click", () => {
  modal.hidden = true;
  showToast("Dnešní plán byl upraven. Nutriční cíl i zásoby zůstaly zachované.");
});

document.addEventListener("keydown", event => { if (event.key === "Escape") modal.hidden = true; });
