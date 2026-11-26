import { useEffect, useRef } from "react";

export function RevokeDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
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
    <dialog ref={ref} aria-labelledby="revoke-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem("reason");
          const reason = field && "value" in field ? String(field.value).trim() : "";
          onConfirm(reason);
        }}
      >
        <h2 id="revoke-title">Revocar certificado</h2>
        <p>Esta acción no se puede deshacer. El certificado dejará de descargarse y su página dirá que fue revocado.</p>
        <label htmlFor="revoke-reason">Motivo (opcional)</label>
        <input id="revoke-reason" name="reason" maxLength={500} autoFocus />
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Revocar certificado
          </button>
        </div>
      </form>
    </dialog>
  );
}
