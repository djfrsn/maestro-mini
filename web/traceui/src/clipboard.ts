// Click-to-copy with a transient flash, ported from the current UI. The
// Clipboard API is tried first; the execCommand textarea path covers insecure
// contexts (plain-http LAN serving) where navigator.clipboard is absent. The
// flash toggles a `.copied` class on the clicked element for ~1s.
function execCommandCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    // Clipboard denied entirely: the flash still confirms the click landed.
  }
  ta.remove();
}

export function copyWithFlash(target: Element, text: string): void {
  const flash = (): void => {
    target.classList.add("copied");
    window.setTimeout(() => target.classList.remove("copied"), 1000);
  };
  try {
    navigator.clipboard.writeText(text).then(flash, () => {
      execCommandCopy(text);
      flash();
    });
  } catch {
    execCommandCopy(text);
    flash();
  }
}
