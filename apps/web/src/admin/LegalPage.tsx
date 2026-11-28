import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell, AccessNote } from "./AdminShell";
import { FormAlert } from "./FormAlert";

type Legal = {
  entityName: string;
  nit: string;
  representative: string;
  issueCity: string;
  disclaimer: string;
  lastFolio: number;
  signers: { slot: number; name: string; title: string }[];
};

export function LegalPage() {
  return (
    <AdminShell title="Datos legales">
      {(me) => (me.role === "admin" && me.instance === "ac3" ? <LegalForm /> : <AccessNote me={me} reason="section" />)}
    </AdminShell>
  );
}

function LegalForm() {
  const [legal, setLegal] = useState<Legal | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void api<Legal>("/api/v1/admin/instance/legal").then(setLegal, (reason: unknown) => setError(reason));
  }, []);

  if (!legal) {
    return (
      <>
        <h1>Datos legales</h1>
        <FormAlert error={error} />
      </>
    );
  }

  return (
    <>
      <h1>Datos legales</h1>
      <FormAlert error={error} />
      <p>El último folio asignado es {legal.lastFolio}. Los certificados ya emitidos conservan la copia que tenían al emitirse.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const signers = legal.signers.map((signer) => ({
            slot: signer.slot,
            name: String(form.get(`signer-${signer.slot}-name`) ?? ""),
            title: String(form.get(`signer-${signer.slot}-title`) ?? ""),
          }));
          setStatus("Guardando…");
          void api<Legal>("/api/v1/admin/instance/legal", {
            method: "PATCH",
            body: JSON.stringify({
              entityName: String(form.get("entityName") ?? ""),
              nit: String(form.get("nit") ?? ""),
              representative: String(form.get("representative") ?? ""),
              issueCity: String(form.get("issueCity") ?? ""),
              disclaimer: String(form.get("disclaimer") ?? ""),
              signers,
            }),
          }).then(
            (saved) => {
              setLegal(saved);
              setError(null);
              setStatus("Datos legales guardados.");
            },
            (reason: unknown) => {
              setError(reason);
              setStatus("");
            },
          );
        }}
      >
        <label htmlFor="entityName">Entidad</label>
        <input id="entityName" name="entityName" defaultValue={legal.entityName} maxLength={255} />
        <label htmlFor="nit">NIT</label>
        <input id="nit" name="nit" defaultValue={legal.nit} maxLength={50} />
        <label htmlFor="representative">Representante</label>
        <input id="representative" name="representative" defaultValue={legal.representative} maxLength={255} />
        <label htmlFor="issueCity">Ciudad de expedición</label>
        <input id="issueCity" name="issueCity" defaultValue={legal.issueCity} maxLength={255} />
        <label htmlFor="disclaimer">Aviso</label>
        <textarea id="disclaimer" name="disclaimer" defaultValue={legal.disclaimer} maxLength={500} required />
        {legal.signers.map((signer) => (
          <fieldset key={signer.slot}>
            <legend>Firmante {signer.slot}</legend>
            <label htmlFor={`signer-${signer.slot}-name`}>Nombre</label>
            <input id={`signer-${signer.slot}-name`} name={`signer-${signer.slot}-name`} defaultValue={signer.name} />
            <label htmlFor={`signer-${signer.slot}-title`}>Cargo</label>
            <input id={`signer-${signer.slot}-title`} name={`signer-${signer.slot}-title`} defaultValue={signer.title} />
          </fieldset>
        ))}
        <button type="submit">Guardar</button>
        <p role="status">{status}</p>
      </form>
    </>
  );
}
