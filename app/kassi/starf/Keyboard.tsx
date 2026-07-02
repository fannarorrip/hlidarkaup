"use client";
// Touch input for the till: a full Icelandic on-screen keyboard (search fields) and a
// number pad (amounts). Buttons use onMouseDown-preventDefault so the bound input keeps
// focus/caret while tapping. A physical keyboard + barcode scanner keep working as before.

const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "ð"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "æ", "ö"],
  ["þ", "z", "x", "c", "v", "b", "n", "m", "á", "é", "í"],
];
const LAST = ["ó", "ú", "ý"];

export function TouchKeyboard({ onKey, onBackspace, onClear, onClose, variant = "pane" }: {
  onKey: (k: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onClose: () => void;
  variant?: "pane" | "fixed";
}) {
  const keep = (e: React.MouseEvent) => e.preventDefault(); // don't steal focus from the input
  const key = "h-12 rounded-lg bg-white border border-gray-200 text-lg font-medium text-[#21323A] active:bg-[#E4F1F0] active:border-[#8CC7C4] select-none";
  const wrap = variant === "fixed"
    ? "fixed inset-x-0 bottom-0 z-[60]"
    : "absolute inset-x-0 bottom-0 z-30";

  return (
    <div className={`${wrap} bg-[#EDF2F3] border-t border-gray-300 shadow-[0_-4px_20px_rgba(33,50,58,0.08)] p-2 pb-3`} onMouseDown={keep}>
      <div className="max-w-3xl mx-auto space-y-1.5">
        {ROWS.map((row, i) => (
          <div key={i} className="flex gap-1.5">
            {row.map((k) => (
              <button key={k} onMouseDown={keep} onClick={() => onKey(k)} className={`${key} flex-1`}>{k}</button>
            ))}
            {i === 0 && (
              <button onMouseDown={keep} onClick={onBackspace} className={`${key} flex-[1.6] text-base`} aria-label="Eyða staf">⌫</button>
            )}
          </div>
        ))}
        <div className="flex gap-1.5">
          {LAST.map((k) => (
            <button key={k} onMouseDown={keep} onClick={() => onKey(k)} className={`${key} flex-1`}>{k}</button>
          ))}
          <button onMouseDown={keep} onClick={() => onKey(" ")} className={`${key} flex-[6]`} aria-label="Bilslá" />
          <button onMouseDown={keep} onClick={onClear} className={`${key} flex-[1.4] text-sm font-semibold text-gray-500`}>Hreinsa</button>
          <button onMouseDown={keep} onClick={onClose} className="h-12 flex-[1.4] rounded-lg bg-[#21323A] text-white text-sm font-semibold active:opacity-80 select-none">Loka</button>
        </div>
      </div>
    </div>
  );
}

export function NumPad({ onDigit, onBackspace, onClear }: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}) {
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const key = "h-14 rounded-xl bg-white border border-gray-200 text-2xl font-semibold text-[#21323A] active:bg-[#E4F1F0] active:border-[#8CC7C4] select-none";
  return (
    <div className="grid grid-cols-3 gap-1.5" onMouseDown={keep}>
      {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
        <button key={d} onMouseDown={keep} onClick={() => onDigit(d)} className={key}>{d}</button>
      ))}
      <button onMouseDown={keep} onClick={onClear} className={`${key} text-base font-semibold text-gray-500`}>C</button>
      <button onMouseDown={keep} onClick={() => onDigit("0")} className={key}>0</button>
      <button onMouseDown={keep} onClick={onBackspace} className={`${key} text-xl`} aria-label="Eyða staf">⌫</button>
    </div>
  );
}
