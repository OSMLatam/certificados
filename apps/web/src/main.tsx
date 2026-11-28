import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuditPage } from "./audit/AuditPage";
import { EventPage } from "./admin/EventPage";
import { EventsPage } from "./admin/EventsPage";
import { HomePage } from "./admin/HomePage";
import { LegalPage } from "./admin/LegalPage";
import { LoginPage } from "./admin/LoginPage";
import { UsersPage } from "./admin/UsersPage";
import { TemplateEditor } from "./editor/TemplateEditor";
import "./styles.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";
const template = path.match(/^\/admin\/events\/([^/]+)\/template$/);
const eventPage = path.match(/^\/admin\/events\/([^/]+)$/);
const root = document.getElementById("root");

function screen() {
  if (path === "/admin/login") return <LoginPage />;
  if (path === "/admin") return <HomePage />;
  if (path === "/admin/events") return <EventsPage />;
  if (path === "/admin/users") return <UsersPage />;
  if (path === "/admin/audit") return <AuditPage />;
  if (path === "/admin/legal") return <LegalPage />;
  if (template?.[1]) return <TemplateEditor eventId={decodeURIComponent(template[1])} />;
  if (eventPage?.[1]) return <EventPage eventId={decodeURIComponent(eventPage[1])} />;
  return <p>Abre el panel en /admin.</p>;
}

if (root) {
  createRoot(root).render(<StrictMode>{screen()}</StrictMode>);
}
