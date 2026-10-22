// node --test — a child's photography and video consent (UiiQ-platform #1117: Yes, No or
// Not answered, recorded by the office with a note on who asked and how) through
// uiiq_students_photo_consent_status / _set and uiiq_students_update, against a local
// stand-in for UIIQ (a throwaway HOME with a fake session, so no real login is read or sent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools, classes;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = reply();
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
  const { studentsTools } = await import("../src/tools/students.js");
  tools = Object.fromEntries(studentsTools.map((t) => [t.name, t]));
  const { classesTools } = await import("../src/tools/classes.js");
  classes = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response) {
  reply = () => response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

async function refusedBeforeAnyRequest(name, args, message) {
  reply = () => [200, { ok: true }];
  seen = [];
  await assert.rejects(tools[name].handler(args), message);
  assert.deepEqual(seen, [], `${name} sent a request`);
}

const DETAIL = {
  source: "office", recordedAt: "2026-10-21T10:00:00.000Z", byEmail: "office@sbda.test", note: "Mum emailed on 21 Oct",
  parentName: "Kim Lee", wording: "We may photograph and film your child at classes and shows.", linkUrl: "https://sbda.test/photos", answerLabel: "No", submittedAt: "2026-10-20T18:00:00.000Z",
};
// What GET /api/students/[id] answers an owner: the whole record, medical details and all.
const STUDENT = {
  id: "stu1", firstName: "Ava", lastName: "Lee", dob: "2019-03-02", medicalNotes: "Asthma", sendNeeds: "Ear defenders", allergies: "Nuts", hasPhoto: true,
  emergencyName: "Gran", emergencyPhone: "07000 000000", photoConsent: true, photoConsentState: "yes", photoConsentDetail: DETAIL, notes: "Collected by Gran on Fridays",
  guardian: { id: "c1", name: "Kim Lee", email: "kim@example.com", phone: "07111 111111" }, policyAcknowledgements: [], enrolments: [{ id: "enr1", className: "Junior Ballet" }],
};

test("status: the consent alone, from the child's record; no medical, SEND, allergy, emergency, guardian, enrolment or photo fields", async () => {
  const { result, requests } = await call("uiiq_students_photo_consent_status", { id: "stu 1" }, [200, STUDENT]);
  assert.deepEqual(requests, [{ method: "GET", path: "/students/stu%201" }]);
  assert.deepEqual(result, { id: "stu1", firstName: "Ava", lastName: "Lee", photoConsent: true, photoConsentState: "yes", photoConsentDetail: DETAIL });
});

test("status: nothing on record reads not_answered with no detail; a missing state is null, never a guessed answer", async () => {
  const none = await call("uiiq_students_photo_consent_status", { id: "stu1" }, [200, { ...STUDENT, photoConsent: false, photoConsentState: "not_answered", photoConsentDetail: null }]);
  assert.equal(none.result.photoConsentState, "not_answered");
  assert.equal(none.result.photoConsentDetail, null);
  assert.equal(none.result.photoConsent, false);
  const { photoConsentState, photoConsentDetail, ...older } = STUDENT;
  const old = await call("uiiq_students_photo_consent_status", { id: "stu1" }, [200, { ...older, photoConsent: "yes" }]);
  assert.equal(old.result.photoConsentState, null);
  assert.equal(old.result.photoConsentDetail, null);
  assert.equal(old.result.photoConsent, false);
});

test("status: UiiQ's refusal comes back in its own words", async () => {
  reply = () => [403, { error: "You don't have permission to view student records." }];
  seen = [];
  await assert.rejects(tools.uiiq_students_photo_consent_status.handler({ id: "stu1" }), { message: "You don't have permission to view student records." });
});

test("set: yes and no are sent as the boolean with the note, and nothing else on the record", async () => {
  const yes = await call("uiiq_students_photo_consent_set", { id: "stu 1", answer: "yes", note: "Mum emailed on 21 Oct", firstName: "Changed", medicalNotes: "x" }, [200, { ok: true }]);
  assert.deepEqual(yes.requests, [{ method: "PATCH", path: "/students/stu%201", body: { photoConsent: true, photoConsentNote: "Mum emailed on 21 Oct" } }]);
  assert.deepEqual(yes.result, { ok: true });
  const no = await call("uiiq_students_photo_consent_set", { id: "stu1", answer: "no", note: "Dad phoned the office" }, [200, { ok: true }]);
  assert.deepEqual(no.requests[0].body, { photoConsent: false, photoConsentNote: "Dad phoned the office" });
});

test("set: no note, a blank note, or an answer that is not yes or no is refused before any request", async () => {
  for (const note of [undefined, "", "   ", 42]) {
    await refusedBeforeAnyRequest("uiiq_students_photo_consent_set", { id: "stu1", answer: "yes", note }, /needs a note saying who asked and how/);
  }
  for (const answer of [undefined, "Yes", true, "not_answered", "maybe"]) {
    await refusedBeforeAnyRequest("uiiq_students_photo_consent_set", { id: "stu1", answer, note: "Mum emailed" }, /answer must be "yes" or "no"/);
  }
});

test("set: UiiQ's refusal (a note over 300 characters) comes back in its own words", async () => {
  reply = () => [400, { error: "The note is longer than 300 characters" }];
  seen = [];
  await assert.rejects(tools.uiiq_students_photo_consent_set.handler({ id: "stu1", answer: "no", note: "x".repeat(301) }), { message: "The note is longer than 300 characters" });
  assert.equal(seen.length, 1);
});

test("update: photoConsent without photoConsentNote is refused before any request; with one, both are sent; without photoConsent no note is needed", async () => {
  for (const photoConsentNote of [undefined, "", "  "]) {
    await refusedBeforeAnyRequest("uiiq_students_update", { id: "stu1", photoConsent: false, photoConsentNote, firstName: "Ava" }, /needs a note saying who asked and how/);
  }
  const both = await call("uiiq_students_update", { id: "stu1", photoConsent: false, photoConsentNote: "Mum emailed on 21 Oct" }, [200, { ok: true }]);
  assert.deepEqual(both.requests, [{ method: "PATCH", path: "/students/stu1", body: { photoConsent: false, photoConsentNote: "Mum emailed on 21 Oct" } }]);
  const plain = await call("uiiq_students_update", { id: "stu1", firstName: "Ava" }, [200, { ok: true }]);
  assert.deepEqual(plain.requests[0].body, { firstName: "Ava" });
});

test("the schemas: status and set closed; set needs id, answer (yes or no) and a note of 1 to 300 characters; update takes photoConsentNote", () => {
  const status = tools.uiiq_students_photo_consent_status.inputSchema;
  assert.equal(status.additionalProperties, false);
  assert.deepEqual(status.required, ["id"]);
  const set = tools.uiiq_students_photo_consent_set.inputSchema;
  assert.equal(set.additionalProperties, false);
  assert.deepEqual(set.required, ["id", "answer", "note"]);
  assert.deepEqual(set.properties.answer.enum, ["yes", "no"]);
  assert.equal(set.properties.note.minLength, 1);
  assert.equal(set.properties.note.maxLength, 300);
  assert.equal(tools.uiiq_students_update.inputSchema.properties.photoConsentNote.maxLength, 300);
  assert.equal("photoConsentNote" in tools.uiiq_students_create.inputSchema.properties, false);
});

test("the descriptions say it in plain words", () => {
  const d = (name) => tools[name].description;
  assert.match(d("uiiq_students_photo_consent_status"), /without the rest of their record \(no medical, SEND, allergy or emergency details, no enrolments, no photo\)/);
  assert.match(d("uiiq_students_photo_consent_status"), /the school treats that as No, so the child is not photographed or filmed/);
  assert.match(d("uiiq_students_photo_consent_status"), /parent_withdrawal = the parent withdrew it online in the Members App/);
  assert.match(d("uiiq_students_photo_consent_set"), /answer "yes" \(the school may photograph and film the child\) or "no" \(it may not\)/);
  assert.match(d("uiiq_students_photo_consent_set"), /who asked and how \(for example "Mum emailed on 21 Oct"\), at most 300 characters/);
  assert.match(d("uiiq_students_photo_consent_set"), /There is no way back to Not answered/);
  assert.match(d("uiiq_students_photo_consent_set"), /confirm with the person before calling/);
  assert.match(d("uiiq_students_update"), /needs photoConsentNote \(who asked and how, at most 300 characters\): without one nothing is sent/);
  assert.match(d("uiiq_students_create"), /false or left out records nothing, so the child is Not answered \(which counts as No\)/);
  assert.match(d("uiiq_students_list"), /photoConsentState: yes, no or not_answered, where not_answered counts as No/);
  assert.match(d("uiiq_students_get"), /photoConsentState \(yes, no or not_answered\) with photoConsentDetail/);
  assert.match(classes.uiiq_classes_register_day.description, /each child also carries photoConsent: "yes", "no" or "not_answered" \(photography and video; not_answered counts as No/);
  assert.match(classes.uiiq_classes_register_day.description, /the photo itself is not returned/);
});
