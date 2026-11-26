import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { AdminShell } from "./AdminShell";

describe("admin shell", () => {
  it("asks for an OpenStreetMap login and offers Entrar", async () => {
    const dom = new Window({ url: "http://localhost/admin" });
    const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
    Object.assign(globalThis, {
      window: dom,
      document: dom.document,
      HTMLElement: dom.HTMLElement,
      Element: dom.Element,
      Node: dom.Node,
      DocumentFragment: dom.DocumentFragment,
      navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
      fetch: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthorized", statusCode: 401 }),
        text: async () => "",
      }),
    });
    try {
      const root = createRoot(dom.document.body);
      await act(async () => {
        root.render(createElement(AdminShell, { title: "Panel", children: () => null }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const link = dom.document.querySelector("a.button-link");
      assert.equal(link?.textContent, "Entrar");
      assert.equal(link?.getAttribute("href"), "/admin/login");
      assert.match(dom.document.body.textContent ?? "", /Inicia sesión con tu cuenta de OpenStreetMap para entrar al panel/);
      assert.equal((dom.document.body.textContent ?? "").includes("Unauthorized"), false);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, previous);
      await dom.close();
    }
  });
});
