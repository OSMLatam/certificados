import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";
import { AccessNote } from "./AdminShell";
import { FormAlert, FormSuccess } from "./FormAlert";

type PanelUser = {
  id: string;
  osmId: string;
  osmUsername: string;
  role: "admin" | "editor" | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

export function UsersPage() {
  return (
    <AdminShell title="Usuarios del panel">
      {(me) => (me.role === "admin" ? <UsersBody /> : <AccessNote me={me} reason="section" />)}
    </AdminShell>
  );
}

function UsersBody() {
  const [items, setItems] = useState<PanelUser[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");

  function reload() {
    void api<{ items: PanelUser[] }>("/api/v1/admin/users?pageSize=100").then(
      (page) => setItems(page.items),
      (reason: unknown) => setError(reason),
    );
  }

  useEffect(reload, []);

  return (
    <>
      <h1>Usuarios del panel</h1>
      <p>La cuenta aparece cuando la persona entra por primera vez con OpenStreetMap.</p>
      <FormAlert error={error} />
      <FormSuccess message={success} />
      <table>
        <caption>Cuentas que ya iniciaron sesión.</caption>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>OSM</th>
            <th>Rol</th>
            <th>Activa</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onSaved={() => {
                setSuccess("Cambios guardados.");
                setError(null);
                reload();
              }}
              onError={(reason) => {
                setSuccess("");
                setError(reason);
              }}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

function UserRow({
  user,
  onSaved,
  onError,
}: {
  user: PanelUser;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [role, setRole] = useState(user.role ?? "");
  const [active, setActive] = useState(user.isActive);

  return (
    <tr>
      <td>{user.osmUsername}</td>
      <td>{user.osmId}</td>
      <td>
        <label htmlFor={`role-${user.id}`}>Rol de {user.osmUsername}</label>
        <select id={`role-${user.id}`} value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">Sin rol</option>
          <option value="editor">Editor</option>
          <option value="admin">Administrador</option>
        </select>
      </td>
      <td>
        <label>
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Activa
        </label>
      </td>
      <td>
        <button
          type="button"
          onClick={() => {
            onError(null);
            void api(`/api/v1/admin/users/${user.id}`, {
              method: "PATCH",
              body: JSON.stringify({ role: role === "" ? null : role, isActive: active }),
            }).then(onSaved, (reason: unknown) => onError(reason));
          }}
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}
