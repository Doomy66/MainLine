/** A small way to build the page in code. */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      el.className = String(value);
    } else if (key === "style") {
      el.setAttribute("style", String(value));
    } else if (value === true) {
      el.setAttribute(key, "");
    } else if (key === "value" && "value" in el) {
      (el as HTMLInputElement).value = String(value);
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? String(c) : c);
  }
  return el;
}

export function mcr(n: number, places = 1): string {
  if (Math.abs(n) >= 1000) return `MCr${Math.round(n).toLocaleString()}`;
  return `MCr${n.toFixed(places)}`;
}

export function tons(n: number): string {
  return `${Math.round(n).toLocaleString()} t`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function meter(share: number, kind = ""): HTMLElement {
  const fill = h("div", { style: `width:${Math.max(0, Math.min(1, share)) * 100}%` });
  if (kind === "" && share < 0.34) fill.style.background = "var(--bad)";
  else if (kind === "" && share < 0.67) fill.style.background = "var(--warn)";
  return h("div", { class: `bar-meter ${kind}` }, fill);
}

export function chip(colour: string): HTMLElement {
  return h("span", { class: "chip", style: `background:${colour}` });
}

/** Children for replaceChildren, with the nulls of optional parts left out. */
export function kids(...children: (Node | string | null | undefined | false)[]): (Node | string)[] {
  return children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
}
