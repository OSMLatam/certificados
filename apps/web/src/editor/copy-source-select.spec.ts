import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { CopySourceSelect } from "./CopySourceSelect";
import type { TemplateSource } from "./template-sources";

const current: TemplateSource = {
  eventId: "event-a",
  eventName: "Evento actual",
  year: 2026,
  templateId: "template-a",
  name: "General",
  roleCode: null,
  hasBackground: false,
};

const other: TemplateSource = {
  eventId: "event-b",
  eventName: "State of the Map Colombia",
  year: 2025,
  templateId: "template-b",
  name: "General",
  roleCode: null,
  hasBackground: true,
};

describe("copy source select", () => {
  it("lists the other event's template and hides the one being edited", async () => {
    const dom = new Window({ url: "http://localhost/admin" });
    const previous = installDom(dom);
    const calls: TemplateSource[] = [];
    const fetchImpl = async () =>
      new Response(JSON.stringify({ items: [current, other] }), { status: 200, headers: { "content-type": "application/json" } });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const root = createRoot(dom.document.body);
      await act(async () => {
        root.render(
          createElement(CopySourceSelect, {
            eventId: current.eventId,
            templateId: current.templateId,
            disabled: false,
            onChoose: (source: TemplateSource) => calls.push(source),
          }),
        );
      });
      const option = await waitFor(() => {
        const found = [...dom.document.querySelectorAll("option")].find((item) => item.textContent?.includes("State of the Map Colombia"));
        return found ?? null;
      });
      assert.equal(option.textContent, "State of the Map Colombia (2025) · General (general)");
      assert.equal([...dom.document.querySelectorAll("option")].some((item) => item.textContent?.includes("Evento actual")), false);
      const select = dom.document.querySelector("select");
      assert.ok(select);
      await act(async () => {
        select.value = other.templateId;
        select.dispatchEvent(new dom.Event("change", { bubbles: true }));
      });
      assert.equal(calls[0]?.templateId, other.templateId);
      await act(async () => {
        root.unmount();
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreDom(previous);
      await dom.close();
    }
  });
});

function installDom(dom: Window): { window: unknown; document: unknown } {
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
  return previous;
}

function restoreDom(previous: { window: unknown; document: unknown }): void {
  Object.assign(globalThis, previous);
}

async function waitFor<T>(read: () => T | null): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < 2000) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the selector did not list the other template");
}
