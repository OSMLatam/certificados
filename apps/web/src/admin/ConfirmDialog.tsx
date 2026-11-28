import { useEffect, useRef } from "react";

export function ConfirmDialog({
  title,
  warning,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  warning: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{warning}</p>
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
