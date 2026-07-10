/**
 * Position a floating panel relative to a trigger button, keeping it
 * fully inside the viewport. Call AFTER the panel has been appended
 * to editorRoot (so its size can be measured), ideally while
 * panel.style.visibility = 'hidden' to avoid a flash of mispositioned content.
 */
export function positionFloatingPanel(panel, triggerBtn, editorRoot, opts = {}) {
  const { gap = 6, margin = 8, allowFlip = true } = opts;

  const bRect = triggerBtn.getBoundingClientRect();
  const eRect = editorRoot.getBoundingClientRect();
  const pRect = panel.getBoundingClientRect();

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  // Horizontal: align with button, then pull back inside viewport
  let left = bRect.left;
  const overflowRight = left + pRect.width - (vw - margin);
  if (overflowRight > 0) left -= overflowRight;
  if (left < margin) left = margin;

  // Vertical: drop below button, flip above if it would overflow bottom
  let top = bRect.bottom + gap;
  if (allowFlip && top + pRect.height > vh - margin) {
    const above = bRect.top - pRect.height - gap;
    if (above >= margin) top = above;
  }

  panel.style.left = `${left - eRect.left}px`;
  panel.style.top  = `${top - eRect.top}px`;
}