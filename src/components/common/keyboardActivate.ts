// Keyboard access for selectable rows/cards that are clicked with a mouse: focusable, and
// Enter/Space trigger the element's own click handler (no duplicated selection logic).
import type React from 'react';

export const keyboardActivate = {
  tabIndex: 0,
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return; // leave nested controls alone
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  }
};
