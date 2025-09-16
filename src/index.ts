// ————————————————————————————————————————————————
// Types & Utilities
// ————————————————————————————————————————————————

interface WebflowAPI {
  notify?: (opts: { type: string; message: string }) => void;
  subscribe?: (event: string, callback: () => void) => void;
}

interface CatOptions {
  el: HTMLElement;
  nameEl: HTMLInputElement;
  prevBtn?: HTMLElement | null;
  nextBtn?: HTMLElement | null;
  jumpBtn?: HTMLElement | null;
  speakBtn?: HTMLElement | null;
  storage?: Storage;
  webflow?: WebflowAPI;
}

type CatRecord = { id: string; name: string };
type CatsMap = Record<string, CatRecord>;

enum StorageKey {
  SelectedCat = "selectedCat",
  CustomCats = "cats",
}

const SYSTEM_CATS = Object.freeze({
  godot: { id: "godot", name: "Saimese" },
  batman: { id: "batman", name: "Batcat" },
  black: { id: "black", name: "Shadow" },
  brown: { id: "brown", name: "Charlie" },
  classic: { id: "classic", name: "Mittens" },
  three: { id: "three", name: "Tricolor" },
  tiger: { id: "tiger", name: "Tiger" },
  white: { id: "white", name: "Snowball" },
} as const);

const DEFAULT_SLUG = "godot";

/** Safe JSON parse with fallback. */
function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    console.error("[Cat] Failed to parse JSON from storage.");
    return fallback;
  }
}

/** Storage helpers with try/catch (storage can throw in private mode, etc.) */
const safeStorage = (storage: Storage) => ({
  get(key: StorageKey): string | null {
    try {
      return storage.getItem(key);
    } catch {
      console.warn(`[Cat] Unable to read "${key}" from storage.`);
      return null;
    }
  },
  set(key: StorageKey, value: string): void {
    try {
      storage.setItem(key, value);
    } catch {
      console.warn(`[Cat] Unable to write "${key}" to storage.`);
    }
  },
});

/** Get Webflow API (optional) from window. */
function getWebflowFromWindow(): WebflowAPI | undefined {
  try {
    return (window as any).webflow as WebflowAPI | undefined;
  } catch {
    return undefined;
  }
}

/** Sanitize an input value to a single trimmed line. */
function cleanName(input: string | null | undefined): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

// ————————————————————————————————————————————————
// Cat Class
// ————————————————————————————————————————————————

class Cat {
  // DOM
  private readonly el: HTMLElement;
  private readonly nameEl: HTMLInputElement;
  private readonly prevBtn?: HTMLElement | null;
  private readonly nextBtn?: HTMLElement | null;
  private readonly jumpBtn?: HTMLElement | null;
  private readonly speakBtn?: HTMLElement | null;

  // Env
  private readonly storage: ReturnType<typeof safeStorage>;
  private readonly webflow?: WebflowAPI;

  // State
  private slug: string = DEFAULT_SLUG;

  constructor({
    el,
    nameEl,
    prevBtn,
    nextBtn,
    jumpBtn,
    speakBtn,
    storage = window.localStorage,
    webflow = getWebflowFromWindow(),
  }: CatOptions) {
    if (!el) throw new Error("[Cat] Missing required element: el");
    if (!nameEl) throw new Error("[Cat] Missing required element: nameEl");

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
  private getCats(): CatsMap {
    const saved = parseJSON<CatsMap>(this.storage.get(StorageKey.CustomCats), {});
    // Ensure each entry minimally conforms to {id, name}
    const normalized: CatsMap = {};
    for (const [k, v] of Object.entries(saved)) {
      if (v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string") {
        normalized[k] = { id: v.id, name: v.name };
      }
    }
    return { ...(SYSTEM_CATS as CatsMap), ...normalized };
  }

  /** Persist the provided cats object to storage. */
  private setCats(cats: CatsMap): void {
    this.storage.set(StorageKey.CustomCats, JSON.stringify(cats));
  }

  /** Load a cat by slug (or from storage), update DOM, and persist selection. */
  private loadCat(slug?: string): void {
    const selected = slug ?? this.storage.get(StorageKey.SelectedCat) ?? DEFAULT_SLUG;
    const cats = this.getCats();
    const cat = cats[selected] ?? cats[DEFAULT_SLUG];

    this.slug = cat.id;
    (this.nameEl as HTMLInputElement).value = cat.name;
    this.el.className = `cat cat--${cat.id}`;

    if (slug) {
      this.storage.set(StorageKey.SelectedCat, slug);
    }
  }

  /** Go to next cat (wraps). */
  private next(): void {
    const slugs = Object.keys(this.getCats());
    const idx = slugs.indexOf(this.slug);
    const start = idx === -1 ? 0 : idx;
    const nextIdx = (start + 1) % slugs.length;
    this.loadCat(slugs[nextIdx]);
  }

  /** Go to previous cat (wraps). */
  private prev(): void {
    const slugs = Object.keys(this.getCats());
    const idx = slugs.indexOf(this.slug);
    const start = idx === -1 ? 0 : idx;
    const prevIdx = (start - 1 + slugs.length) % slugs.length;
    this.loadCat(slugs[prevIdx]);
  }

  /** Add a temporary jump animation class and auto-remove when finished. */
  private jump(): void {
    if (this.el.classList.contains("jump")) return; // let current animation finish
    this.el.classList.add("jump");
    this.el.addEventListener(
      "animationend",
      () => this.el.classList.remove("jump"),
      { once: true }
    );
  }

  /** Save edited name for current cat to storage (non-empty, trimmed). */
  private setNameFromInput(): void {
    const cats = this.getCats();
    const current = cats[this.slug];
    if (!current) return;

    const cleaned = cleanName((this.nameEl as HTMLInputElement).value);
    const newName = cleaned || current.name; // fall back to prior name if blank

    const updated: CatsMap = {
      ...cats,
      [this.slug]: { ...current, name: newName },
    };

    this.setCats(updated);
    // Keep DOM in sync if user cleared then blurred
    (this.nameEl as HTMLInputElement).value = updated[this.slug].name;
  }

  /** Notify via Webflow if available; otherwise log to console. */
  private speak(): void {
    if (this.webflow?.notify) {
      try {
        this.webflow.notify({ type: "Info", message: "Meow!" });
        return;
      } catch {
        // fall through to console
      }
    }
    console.info("Meow!");
  }

  /** Wire up all UI interactions with tiny guards. */
  private bindEvents(): void {
    // Cat element
    this.el.addEventListener("click", () => this.jump());

    // Name editing
    this.nameEl.addEventListener("blur", () => this.setNameFromInput());
    this.nameEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
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
      } catch {
        console.warn("[Cat] Failed to subscribe to Webflow events.");
      }
    }
  }
}

// ————————————————————————————————————————————————
// Bootstrap
// ————————————————————————————————————————————————

/** Helper to require an element by selector and fail loudly in dev. */
function qsRequired<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`[Cat] Required element not found: ${selector}`);
  }
  return el as T;
}

const app = new Cat({
  el: qsRequired<HTMLElement>(".cat"),
  nameEl: qsRequired<HTMLInputElement>(".cat-name"),
  prevBtn: document.getElementById("prev"),
  nextBtn: document.getElementById("next"),
  jumpBtn: document.getElementById("jump"),
  speakBtn: document.getElementById("speak"),
  storage: window.localStorage,
  webflow: getWebflowFromWindow(),
});

// Optional: expose for debugging
(window as any).__cat = app;