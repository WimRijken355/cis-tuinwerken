/**
 * Pointer helpers for search-as-you-type lists on touch devices.
 *
 * On a phone, tapping a result below a focused search field first blurs the
 * field. The on-screen keyboard then closes and the layout (e.g. a bottom
 * sheet sized with `dvh`) jumps before the `click` is dispatched, so the click
 * lands on another element or on the modal backdrop and the selection is lost.
 */

interface PreventableEvent {
  preventDefault: () => void;
}

/**
 * `onMouseDown` handler for result buttons: prevents the search field from
 * losing focus, so the keyboard (and the layout) stays put until the `click`
 * fires. Scrolling the list still works (scrolling uses touch, not mousedown).
 */
export function keepInputFocus(e: PreventableEvent): void {
  e.preventDefault();
}

/**
 * A backdrop click only dismisses a modal when the press both started and
 * ended on the backdrop itself. A click that merely *ends* on the backdrop
 * (because the content moved under the finger) must not close the modal.
 */
export function isBackdropDismiss(pressStartedOnBackdrop: boolean, target: unknown, backdrop: unknown): boolean {
  return pressStartedOnBackdrop && target === backdrop;
}
