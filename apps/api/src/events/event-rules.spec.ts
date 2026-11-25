import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activationBlocked, resolveCertificateTemplate, resolveVenueId } from "./event-rules";

describe("activationBlocked", () => {
  it("blocks an active generated event without a default template", () => {
    assert.equal(
      activationBlocked({ status: "active", pregeneratedOnly: false, defaultTemplateId: null }),
      true,
    );
  });

  it("allows a draft without a template and a pregenerated event without one", () => {
    assert.equal(
      activationBlocked({ status: "draft", pregeneratedOnly: false, defaultTemplateId: null }),
      false,
    );
    assert.equal(
      activationBlocked({ status: "active", pregeneratedOnly: true, defaultTemplateId: null }),
      false,
    );
  });
});

describe("resolveVenueId", () => {
  const venues = [
    { id: "a", code: "BOG" },
    { id: "b", code: "MED" },
  ];

  it("infers the only venue", () => {
    assert.deepEqual(resolveVenueId({ venues: [venues[0]!], venueCode: undefined }), { venueId: "a" });
  });

  it("leaves the venue empty when there are several and no code", () => {
    assert.deepEqual(resolveVenueId({ venues, venueCode: undefined }), { venueId: null });
  });

  it("rejects an unknown code", () => {
    assert.deepEqual(resolveVenueId({ venues, venueCode: "CAL" }), { error: "unknown" });
  });
});

describe("resolveCertificateTemplate", () => {
  it("requires a template for generated certificates", () => {
    assert.deepEqual(
      resolveCertificateTemplate({
        pregeneratedOnly: false,
        defaultTemplateId: null,
        roleTemplateId: null,
      }),
      { error: "missing" },
    );
    assert.deepEqual(
      resolveCertificateTemplate({
        pregeneratedOnly: false,
        defaultTemplateId: "default",
        roleTemplateId: "ponente",
      }),
      { mode: "generated", templateId: "ponente" },
    );
  });

  it("does not use a template for pregenerated events", () => {
    assert.deepEqual(
      resolveCertificateTemplate({
        pregeneratedOnly: true,
        defaultTemplateId: "default",
        roleTemplateId: null,
      }),
      { mode: "pregenerated", templateId: null },
    );
  });
});
