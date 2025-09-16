// ————————————————————————————————————————————————
// Types & Utilities
// ————————————————————————————————————————————————
var StorageKey;
(function (StorageKey) {
    StorageKey["SelectedCat"] = "selectedCat";
    StorageKey["CustomCats"] = "cats";
})(StorageKey || (StorageKey = {}));
const SYSTEM_CATS = Object.freeze({
    godot: { id: "godot", name: "Saimese" },
    batman: { id: "batman", name: "Batcat" },
    black: { id: "black", name: "Shadow" },
    brown: { id: "brown", name: "Charlie" },
    classic: { id: "classic", name: "Mittens" },
    three: { id: "three", name: "Tricolor" },
    tiger: { id: "tiger", name: "Tiger" },
    white: { id: "white", name: "Snowball" },
});
const DEFAULT_SLUG = "godot";
/** Safe JSON parse with fallback. */
function parseJSON(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        const parsed = JSON.parse(raw);
        return (parsed ?? fallback);
    }
    catch {
        console.error("[Cat] Failed to parse JSON from storage.");
        return fallback;
    }
}
/** Storage helpers with try/catch (storage can throw in private mode, etc.) */
const safeStorage = (storage) => ({
    get(key) {
        try {
            return storage.getItem(key);
        }
        catch {
            console.warn(`[Cat] Unable to read "${key}" from storage.`);
            return null;
        }
    },
    set(key, value) {
        try {
            storage.setItem(key, value);
        }
        catch {
            console.warn(`[Cat] Unable to write "${key}" to storage.`);
        }
    },
});
/** Get Webflow API (optional) from window. */
function getWebflowFromWindow() {
    try {
        return window.webflow;
    }
    catch {
        return undefined;
    }
}
/** Sanitize an input value to a single trimmed line. */
function cleanName(input) {
    return (input ?? "").replace(/\s+/g, " ").trim();
}
// ————————————————————————————————————————————————
// Cat Class
// ————————————————————————————————————————————————
class Cat {
    constructor({ el, nameEl, prevBtn, nextBtn, jumpBtn, speakBtn, storage = window.localStorage, webflow = getWebflowFromWindow(), }) {
        // State
        this.slug = DEFAULT_SLUG;
        if (!el)
            throw new Error("[Cat] Missing required element: el");
        if (!nameEl)
            throw new Error("[Cat] Missing required element: nameEl");
        this.el = el;
        this.nameEl = nameEl;
        this.prevBtn = prevBtn ?? null;
        this.nextBtn = nextBtn ?? null;
        this.jumpBtn = jumpBtn ?? null;
        this.speakBtn = speakBtn ?? null;
        this.storage = safeStorage(storage);
        this.webflow = webflow;
        // Initial render
        this.loadCat();
        this.bindEvents();
    }
    /** Merge system cats with any user-customized cats from storage. */
    getCats() {
        const saved = parseJSON(this.storage.get(StorageKey.CustomCats), {});
        // Ensure each entry minimally conforms to {id, name}
        const normalized = {};
        for (const [k, v] of Object.entries(saved)) {
            if (v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string") {
                normalized[k] = { id: v.id, name: v.name };
            }
        }
        return { ...SYSTEM_CATS, ...normalized };
    }
    /** Persist the provided cats object to storage. */
    setCats(cats) {
        this.storage.set(StorageKey.CustomCats, JSON.stringify(cats));
    }
    /** Load a cat by slug (or from storage), update DOM, and persist selection. */
    loadCat(slug) {
        const selected = slug ?? this.storage.get(StorageKey.SelectedCat) ?? DEFAULT_SLUG;
        const cats = this.getCats();
        const cat = cats[selected] ?? cats[DEFAULT_SLUG];
        this.slug = cat.id;
        this.nameEl.value = cat.name;
        this.el.className = `cat cat--${cat.id}`;
        if (slug) {
            this.storage.set(StorageKey.SelectedCat, slug);
        }
    }
    /** Go to next cat (wraps). */
    next() {
        const slugs = Object.keys(this.getCats());
        const idx = slugs.indexOf(this.slug);
        const start = idx === -1 ? 0 : idx;
        const nextIdx = (start + 1) % slugs.length;
        this.loadCat(slugs[nextIdx]);
    }
    /** Go to previous cat (wraps). */
    prev() {
        const slugs = Object.keys(this.getCats());
        const idx = slugs.indexOf(this.slug);
        const start = idx === -1 ? 0 : idx;
        const prevIdx = (start - 1 + slugs.length) % slugs.length;
        this.loadCat(slugs[prevIdx]);
    }
    /** Add a temporary jump animation class and auto-remove when finished. */
    jump() {
        if (this.el.classList.contains("jump"))
            return; // let current animation finish
        this.el.classList.add("jump");
        this.el.addEventListener("animationend", () => this.el.classList.remove("jump"), { once: true });
    }
    /** Save edited name for current cat to storage (non-empty, trimmed). */
    setNameFromInput() {
        const cats = this.getCats();
        const current = cats[this.slug];
        if (!current)
            return;
        const cleaned = cleanName(this.nameEl.value);
        const newName = cleaned || current.name; // fall back to prior name if blank
        const updated = {
            ...cats,
            [this.slug]: { ...current, name: newName },
        };
        this.setCats(updated);
        // Keep DOM in sync if user cleared then blurred
        this.nameEl.value = updated[this.slug].name;
    }
    /** Notify via Webflow if available; otherwise log to console. */
    speak() {
        if (this.webflow?.notify) {
            try {
                this.webflow.notify({ type: "Info", message: "Meow!" });
                return;
            }
            catch {
                // fall through to console
            }
        }
        console.info("Meow!");
    }
    /** Wire up all UI interactions with tiny guards. */
    bindEvents() {
        // Cat element
        this.el.addEventListener("click", () => this.jump());
        // Name editing
        this.nameEl.addEventListener("blur", () => this.setNameFromInput());
        this.nameEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
            }
        });
        // Controls
        this.prevBtn?.addEventListener("click", () => this.prev());
        this.nextBtn?.addEventListener("click", () => this.next());
        this.jumpBtn?.addEventListener("click", () => this.jump());
        this.speakBtn?.addEventListener("click", () => this.speak());
        // Webflow hooks
        if (this.webflow?.subscribe) {
            try {
                this.webflow.subscribe("selectedelement", () => this.jump());
            }
            catch {
                console.warn("[Cat] Failed to subscribe to Webflow events.");
            }
        }
    }
}
// ————————————————————————————————————————————————
// Bootstrap
// ————————————————————————————————————————————————
/** Helper to require an element by selector and fail loudly in dev. */
function qsRequired(selector) {
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(`[Cat] Required element not found: ${selector}`);
    }
    return el;
}
const app = new Cat({
    el: qsRequired(".cat"),
    nameEl: qsRequired(".cat-name"),
    prevBtn: document.getElementById("prev"),
    nextBtn: document.getElementById("next"),
    jumpBtn: document.getElementById("jump"),
    speakBtn: document.getElementById("speak"),
    storage: window.localStorage,
    webflow: getWebflowFromWindow(),
});
// Optional: expose for debugging
window.__cat = app;
