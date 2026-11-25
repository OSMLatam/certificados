import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { RevokeDialog } from "./RevokeDialog";

describe("revoke dialog", () => {
  it("warns that revocation cannot be undone and sends the reason", async () => {
    const dom = new Window({ url: "http://localhost/admin" });
    const previous = { window: globalThis.window, document: globalThis.document };
    Object.assign(globalThis, {
      window: dom,
      document: dom.document,
      HTMLElement: dom.HTMLElement,
      Element: dom.Element,
      Node: dom.Node,
      DocumentFragment: dom.DocumentFragment,
      navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    const confirmed: string[] = [];
    let cancelled = 0;
    try {
      const root = createRoot(dom.document.body);
      await act(async () => {
        root.render(
          createElement(RevokeDialog, {
            onCancel: () => {
              cancelled += 1;
            },
            onConfirm: (reason: string) => confirmed.push(reason),
          }),
        );
      });
      const text = dom.document.body.textContent ?? "";
      assert.match(text, /no se puede deshacer/);
      const reason = dom.document.querySelector("#revoke-reason");
      assert.ok(reason instanceof dom.HTMLInputElement);
      reason.value = "  nombre mal escrito  ";
      await act(async () => {
        dom.document.querySelector("form")?.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }));
      });
      assert.deepEqual(confirmed, ["nombre mal escrito"]);
      assert.equal(cancelled, 0);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, previous);
      await dom.close();
    }
  });
});