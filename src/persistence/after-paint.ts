/** Give admitted content a rendering opportunity before synchronous capture.
 * Hidden tabs still persist; a suspended frame callback must not stall saving. */
export function beforeSaveCapture(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame !== 'function' || typeof document === 'undefined' || document.hidden) {
      setTimeout(resolve, 0); return;
    }
    let frame: number;
    const finish = () => { cancelAnimationFrame(frame); clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, 250);
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
}
