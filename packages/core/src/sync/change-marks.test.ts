import { describe, expect, it } from "vitest";
import {
  type ChangeMark,
  markForChange,
  mergeMarks,
  secretFieldIds,
  settleMarks,
  withMarks,
} from "./change-marks.ts";
import { EntryContent, mergeContent } from "./content.ts";
import { bank, withField } from "./test/fixtures.ts";

const max = "MDAwMDAwMDAwMDAwMDAwMA";
const sandra = "QEBAQEBAQEBAQEBAQEBAQA";
const pin = { id: "pin", name: "PIN", value: "4711", kind: "secret" as const };
const totp = { id: "otp", name: "Einmalcode", value: "JBSWY3DPEHPK3PXP", kind: "totp" as const };
const withPin = { ...bank, fields: [...bank.fields, pin, totp] };
const markOf = (fields: string[], account = max, at = 1_800_000_500): ChangeMark => ({
  account,
  at,
  fields,
});

describe("secretFieldIds", () => {
  it("names the secrets and one-time code keys that hold a value, nothing else", () => {
    expect(secretFieldIds(withPin)).toEqual(["password", "pin", "otp"]);
    expect(secretFieldIds(withField(withPin, "pin", ""))).toEqual(["password", "otp"]);
  });
});

describe("markForChange (P-11)", () => {
  it("marks every secret the person could read, with who and when", () => {
    expect(markForChange(withPin, max, 1_800_000_500).toChange).toEqual([
      markOf(["password", "pin", "otp"]),
    ]);
  });

  it("marks only the secrets that still hold the value of the version the person read", () => {
    const changed = withField(withPin, "pin", "0815");
    expect(markForChange(changed, max, 1_800_000_500, withPin).toChange).toEqual([
      markOf(["password", "otp"]),
    ]);
    const added = { ...bank, fields: [...bank.fields, pin] };
    expect(markForChange(added, max, 1_800_000_500, bank).toChange).toEqual([markOf(["password"])]);
    expect(markForChange(withField(bank, "password", "x"), max, 1, bank)).not.toHaveProperty(
      "toChange",
    );
  });

  it("leaves an entry without secrets as it is, without an empty list", () => {
    const note = { ...bank, fields: bank.fields.filter((f) => f.kind !== "secret") };
    expect(markForChange(note, max, 1)).toEqual(note);
    expect("toChange" in markForChange(note, max, 1)).toBe(false);
  });

  it("keeps the marks of others and adds a second person's own mark", () => {
    const once = markForChange(bank, max, 10);
    expect(markForChange(once, sandra, 20).toChange).toEqual([
      markOf(["password"], max, 10),
      markOf(["password"], sandra, 20),
    ]);
  });

  it("widens only the person's own mark", () => {
    const both = markForChange(markForChange(bank, sandra, 5), max, 10);
    const widened = markForChange({ ...both, fields: [...both.fields, pin] }, max, 20);
    expect(widened.toChange).toEqual([
      markOf(["password"], sandra, 5),
      markOf(["password", "pin"], max, 10),
    ]);
  });

  it("widens the person's own mark to new secrets and keeps its first time", () => {
    const once = markForChange(bank, max, 10);
    const twice = markForChange({ ...once, fields: [...once.fields, pin] }, max, 20);
    expect(twice.toChange).toEqual([markOf(["password", "pin"], max, 10)]);
    expect(markForChange(once, max, 20).toChange).toEqual([markOf(["password"], max, 10)]);
  });
});

describe("settleMarks", () => {
  const marks = [markOf(["password", "pin"]), markOf(["pin"], sandra)];

  it("drops a field whose value changed, and a mark with no field left", () => {
    expect(settleMarks(marks, withPin, withField(withPin, "pin", "0815"))).toEqual([
      markOf(["password"]),
    ]);
  });

  it("drops a field that was deleted", () => {
    const without = { ...withPin, fields: withPin.fields.filter((f) => f.id !== "password") };
    expect(settleMarks(marks, withPin, without)).toEqual([
      markOf(["pin"]),
      markOf(["pin"], sandra),
    ]);
  });

  it("keeps what did not change", () => {
    expect(settleMarks(marks, withPin, structuredClone(withPin))).toEqual(marks);
  });

  it("drops a field that is in neither version", () => {
    expect(settleMarks([markOf(["gone"])], withPin, withPin)).toEqual([]);
  });
});

describe("withMarks", () => {
  it("sets the marks, and none removes the key", () => {
    expect(withMarks(bank, [markOf(["password"])]).toChange).toEqual([markOf(["password"])]);
    expect("toChange" in withMarks({ ...bank, toChange: [markOf(["password"])] }, [])).toBe(false);
  });
});

describe("mergeMarks: three ways, as the content (P-21)", () => {
  const marked = markForChange(bank, max, 10);

  it("keeps a mark one side added on the value that stays", () => {
    const merged = mergeContent(bank, marked, withField(bank, "user", "anna"), 20);
    expect(merged.toChange).toEqual([markOf(["password"], max, 10)]);
    const theirs = mergeContent(bank, withField(bank, "user", "anna"), marked, 20);
    expect(theirs.toChange).toEqual([markOf(["password"], max, 10)]);
  });

  it("drops a mark whose secret the other side changed: the person never read the new one", () => {
    const changed = withField(bank, "password", "Neu-2027!");
    expect(mergeContent(bank, marked, changed, 20).toChange).toBeUndefined();
    expect(mergeContent(bank, changed, marked, 20).toChange).toBeUndefined();
  });

  it("drops a mark one side settled since the base", () => {
    const settled = withMarks(withField(marked, "user", "anna"), []);
    expect(mergeContent(marked, settled, marked, 20).toChange).toBeUndefined();
    expect(mergeContent(marked, marked, settled, 20).toChange).toBeUndefined();
    expect(mergeContent(marked, marked, structuredClone(marked), 20).toChange).toEqual(
      marked.toChange,
    );
  });

  it("joins the fields when both sides marked anew, at the earlier time", () => {
    const mine = markForChange(withPin, max, 30);
    const theirs = { ...withPin, toChange: [markOf(["password"], max, 10)] };
    expect(mergeMarks(withPin, mine, theirs, withPin.fields)).toEqual([
      markOf(["password", "pin", "otp"], max, 10),
    ]);
  });

  it("merges the marks of several people each on their own", () => {
    const base = { ...withPin, toChange: [markOf(["pin"], sandra, 5), markOf(["password"])] };
    const mine = { ...withPin, toChange: [markOf(["pin"], sandra, 5)] };
    const theirs = { ...base };
    expect(mergeMarks(base, mine, theirs, withPin.fields)).toEqual([markOf(["pin"], sandra, 5)]);
    const fresh = { ...withPin, toChange: [markOf(["pin"], sandra, 5), markOf(["otp"])] };
    expect(mergeMarks(withPin, fresh, withPin, withPin.fields)).toEqual([
      markOf(["pin"], sandra, 5),
      markOf(["otp"]),
    ]);
  });

  it("drops a marked field that neither the side nor the merge has", () => {
    const ghost = { ...withPin, toChange: [markOf(["ghost", "pin"])] };
    expect(mergeMarks(withPin, ghost, withPin, withPin.fields)).toEqual([markOf(["pin"])]);
  });

  it("keeps a field of the base only while both sides keep it", () => {
    const base = { ...withPin, toChange: [markOf(["password", "pin"])] };
    const mine = { ...withPin, toChange: [markOf(["password", "pin"])] };
    const theirs = { ...withPin, toChange: [markOf(["password"])] };
    expect(mergeMarks(base, mine, theirs, withPin.fields)).toEqual([markOf(["password"])]);
  });

  it("parses back from the content's schema, and refuses a mark without fields", () => {
    expect(EntryContent.parse(JSON.parse(JSON.stringify(marked)))).toEqual(marked);
    expect(EntryContent.safeParse({ ...bank, toChange: [markOf([])] }).success).toBe(false);
    expect(EntryContent.safeParse({ ...bank, toChange: [markOf(["x"], "")] }).success).toBe(false);
    expect(EntryContent.safeParse({ ...bank, toChange: [markOf([""])] }).success).toBe(false);
    expect(EntryContent.safeParse({ ...bank, toChange: [markOf(["x"], max, -1)] }).success).toBe(
      false,
    );
  });
});
