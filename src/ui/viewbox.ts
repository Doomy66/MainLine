/**
 * A window on to a drawing, matched to the shape of the panel it is in.
 * Copied from PlanetHex src/ui/viewbox.ts, so this map zooms and pans as its maps do.
 *
 * Two maps want the same thing: fill the panel, go in and out on a wheel, move
 * on a drag, and never let the drawing be lost off the edge. The arithmetic is
 * the same for both and lives here, so a subsector and a sector map cannot disagree
 * about what zooming means.
 *
 * The view's height is what the zoom sets; the width follows from the panel's
 * shape. That is what fills a wide panel with more map either side rather than
 * with a margin, which is the whole point of matching the aspect rather than
 * letting an SVG letterbox itself.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface View {
  /** One is the whole of `content` on the page. */
  zoom: number;
  /** The middle of the view, in drawing units. */
  x: number;
  y: number;
}

/** What a wheel turn does, and how far in and out it is allowed to go. */
export interface Limits {
  readonly out: number;
  readonly in: number;
}

/**
 * The viewBox for a view of a drawing in a panel.
 *
 * Held so the drawing cannot be dragged away: where the view is wider than the
 * drawing, the drawing sits in the middle of it, and where it is narrower it
 * stays inside the edges.
 */
export function boxFor(content: Box, view: View, panel: { width: number; height: number }): Box {
  const shape =
    panel.width > 0 && panel.height > 0
      ? panel.width / panel.height
      : content.width / content.height;
  // One is the whole of the drawing in view, whichever way round the two are:
  // the axis that needs the most room is the one that decides, or a zoom of one
  // would be showing a part of the map and calling it the whole.
  const fit = Math.max(content.width / shape, content.height);
  const height = fit / view.zoom;
  const width = height * shape;
  return {
    x: middle(view.x, width, content.x, content.width),
    y: middle(view.y, height, content.y, content.height),
    width,
    height,
  };
}

/** Where one edge sits: centred where there is room, held inside where there is not. */
function middle(at: number, size: number, from: number, whole: number): number {
  if (size >= whole) return from + whole / 2 - size / 2;
  return Math.min(Math.max(at - size / 2, from), from + whole - size);
}

/** The view after a wheel turn about a point, keeping that point where it is. */
export function zoomedAt(
  content: Box,
  view: View,
  panel: { width: number; height: number },
  by: number,
  at: { x: number; y: number },
  limits: Limits,
): View {
  const held = Math.min(limits.in, Math.max(limits.out, view.zoom * by));
  if (held === view.zoom) return view;
  const before = boxFor(content, view, panel);
  const share = {
    x: (at.x - before.x) / before.width,
    y: (at.y - before.y) / before.height,
  };
  const after = boxFor(content, { ...view, zoom: held }, panel);
  // The point under the pointer stays under the pointer, which is what makes a
  // wheel feel like a magnifier rather than a scrollbar.
  return {
    zoom: held,
    x: at.x - (share.x - 0.5) * after.width,
    y: at.y - (share.y - 0.5) * after.height,
  };
}

/** Where a pointer is, in the drawing's own units. */
export function pointIn(
  event: { clientX: number; clientY: number },
  element: Element,
  box: Box,
): { x: number; y: number } {
  const on = element.getBoundingClientRect();
  if (on.width === 0 || on.height === 0) return { x: box.x, y: box.y };
  return {
    x: box.x + ((event.clientX - on.left) / on.width) * box.width,
    y: box.y + ((event.clientY - on.top) / on.height) * box.height,
  };
}

/** The view that shows the whole of a drawing, centred. */
export function wholeOf(content: Box): View {
  return { zoom: 1, x: content.x + content.width / 2, y: content.y + content.height / 2 };
}
