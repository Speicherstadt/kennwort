/**
 * Whether the page shows a login field to the user (K-403, P-17). The menu opens only on a field
 * the user can see, and a fill writes only into fields the user can see: a page that shows a user
 * name field and hides a password field after it (off the page, transparent, a pixel wide, not
 * displayed) would otherwise get a password the user never saw going in, read by its script before
 * anyone submits (DOM-based extension clickjacking, Marek Tóth, DEF CON 33, 2025, and the hidden
 * form fields of earlier autofill attacks).
 */

/** Smaller than this in either direction, a field is not one a user reads or types into */
const MIN_SIZE = 4;
/** Fainter than this, all opacities from the field up to the root multiplied */
const MIN_OPACITY = 0.2;

const opacityOf = (style: CSSStyleDeclaration) => {
  const value = Number.parseFloat(style.opacity);
  return Number.isNaN(value) ? 1 : value;
};

/** The opacity the field is drawn with: its own times that of every ancestor */
const drawnOpacity = (field: Element, view: Window) => {
  let opacity = 1;
  for (let element: Element | null = field; element; element = element.parentElement) {
    opacity *= opacityOf(view.getComputedStyle(element));
  }
  return opacity;
};

export const fieldShown = (field: HTMLElement) => {
  const view = field.ownerDocument.defaultView;
  if (!view || !field.isConnected) return false;
  const rendered = field.checkVisibility({
    opacityProperty: true,
    visibilityProperty: true,
    contentVisibilityAuto: true,
  });
  if (!rendered || drawnOpacity(field, view) < MIN_OPACITY) return false;
  const box = field.getBoundingClientRect();
  if (box.width < MIN_SIZE || box.height < MIN_SIZE) return false;
  // Left of or above the page, where no scrolling brings it into view
  return box.right + view.scrollX > 0 && box.bottom + view.scrollY > 0;
};
