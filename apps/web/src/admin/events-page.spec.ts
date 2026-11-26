import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { EventsPage } from "./EventsPage";

describe("event form", () => {
  it("shows the server message next to the name and the start date", async () => {
    const dom = new Window({ url: "http://localhost/admin/events" });
    const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
    const calls: string[] = [];
    Object.assign(globalThis, {
      window: dom,
      document: dom.document,
      HTMLElement: dom.HTMLElement,
      Element: dom.Element,
      Node: dom.Node,
      DocumentFragment: dom.DocumentFragment,
      navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
      fetch: async (input: string, init?: { method?: string }) => {
        calls.push(`${init?.method ?? "GET"} ${input}`);
        if (String(input).includes("/auth/me")) {
          return reply(200, { id: "1", role: "admin", osmUsername: "ana", isActive: true });
        }
        if (init?.method === "POST") {
          return reply(400, {
            message: "Validation failed",
            details: [
              { field: "name", message: "Escribe el nombre del evento" },
              { field: "startDate", message: "Escribe la fecha de inicio" },
            ],
          });
        }
        return reply(200, { items: [] });
      },
    });
    try {
      const root = createRoot(dom.document.body);
      await act(async () => {
        root.render(createElement(EventsPage));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const form = dom.document.querySelector("form");
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const name = dom.document.querySelector("#event-name");
      const date = dom.document.querySelector("#event-date");
      assert.equal(name?.getAttribute("aria-invalid"), "true");
      assert.equal(name?.getAttribute("aria-describedby"), "event-name-error");
      assert.equal(dom.document.querySelector("#event-name-error")?.textContent, "Escribe el nombre del evento");
      assert.equal(date?.getAttribute("aria-describedby"), "event-date-error");
      assert.equal(dom.document.querySelector("#event-date-error")?.textContent, "Escribe la fecha de inicio");
      assert.equal(calls.some((call) => call.startsWith("POST ")), true);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, previous);
      await dom.close();
    }
  });
});

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
