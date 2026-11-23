import { describe, expect, it } from "vitest";
import { companyFate, type DeletionMember, deletionPlan, vaultFate } from "./account-deletion.ts";

const NOW = 1_800_000_000;
const manage = (validUntil = 0): DeletionMember => ({ role: "manage", validUntil });
const edit: DeletionMember = { role: "edit", validUntil: 0 };
const read: DeletionMember = { role: "read", validUntil: 0 };
const members = (entries: [string, DeletionMember][]) => new Map(entries);

describe("vaultFate", () => {
  it("gives nothing for a vault the log does not name the person in", () => {
    expect(vaultFate(members([["anna", manage()]]), "jonas", NOW)).toBeUndefined();
  });

  it("drops a vault nobody else is in, whatever the role", () => {
    expect(vaultFate(members([["jonas", manage()]]), "jonas", NOW)).toBe("drop");
    expect(vaultFate(members([["jonas", read]]), "jonas", NOW)).toBe("drop");
  });

  it("leaves a vault where another manager remains", () => {
    const vault = members([
      ["jonas", manage()],
      ["anna", manage()],
    ]);
    expect(vaultFate(vault, "jonas", NOW)).toBe("leave");
    // One other manager among readers is enough
    const mixed = members([
      ["jonas", manage()],
      ["max", read],
      ["anna", manage()],
    ]);
    expect(vaultFate(mixed, "jonas", NOW)).toBe("leave");
  });

  it("waits for a manager in a vault the person does not manage", () => {
    expect(
      vaultFate(
        members([
          ["jonas", edit],
          ["anna", manage()],
        ]),
        "jonas",
        NOW,
      ),
    ).toBe("await");
    expect(
      vaultFate(
        members([
          ["jonas", read],
          ["anna", read],
        ]),
        "jonas",
        NOW,
      ),
    ).toBe("await");
  });

  it("counts a manager whose access ran out as no manager, on both sides", () => {
    const expiredMe = members([
      ["jonas", manage(NOW)],
      ["anna", manage()],
    ]);
    expect(vaultFate(expiredMe, "jonas", NOW)).toBe("await");
    const expiredOther = members([
      ["jonas", manage()],
      ["anna", manage(NOW)],
    ]);
    expect(vaultFate(expiredOther, "jonas", NOW)).toBe("sole-manager");
    const stillValid = members([
      ["jonas", manage(NOW + 1)],
      ["anna", manage(NOW + 1)],
    ]);
    expect(vaultFate(stillValid, "jonas", NOW)).toBe("leave");
  });

  it("refuses to leave a vault whose other members may not manage it", () => {
    const vault = members([
      ["jonas", manage()],
      ["anna", edit],
      ["max", read],
    ]);
    expect(vaultFate(vault, "jonas", NOW)).toBe("sole-manager");
  });
});

describe("deletionPlan", () => {
  it("sorts every vault the person is in by its fate and skips the rest", () => {
    const plan = deletionPlan(
      [
        { id: "personal", members: members([["jonas", manage()]]) },
        {
          id: "office",
          members: members([
            ["jonas", manage()],
            ["anna", manage()],
          ]),
        },
        {
          id: "heating",
          members: members([
            ["jonas", read],
            ["anna", manage()],
          ]),
        },
        {
          id: "bank",
          members: members([
            ["jonas", manage()],
            ["max", edit],
          ]),
        },
        { id: "foreign", members: members([["anna", manage()]]) },
      ],
      "jonas",
      NOW,
    );
    expect(plan).toEqual({
      drop: ["personal"],
      leave: ["office"],
      await: ["heating"],
      "sole-manager": ["bank"],
    });
  });

  it("is empty without vaults", () => {
    expect(deletionPlan([], "jonas", NOW)).toEqual({
      drop: [],
      leave: [],
      await: [],
      "sole-manager": [],
    });
  });
});

describe("companyFate", () => {
  const account = (id: string, role: string, leftAt: number | null = null) => ({
    id,
    role,
    leftAt,
  });

  it("knows no account the company does not have or that left", () => {
    expect(companyFate([account("anna", "owner")], "jonas")).toBeUndefined();
    expect(
      companyFate([account("jonas", "owner", 5), account("anna", "owner")], "jonas"),
    ).toBeUndefined();
  });

  it("erases the company with its last account, also when others left before", () => {
    expect(companyFate([account("jonas", "owner")], "jonas")).toBe("erase");
    expect(companyFate([account("jonas", "owner"), account("max", "owner", 7)], "jonas")).toBe(
      "erase",
    );
  });

  it("keeps the last owner while others remain", () => {
    expect(companyFate([account("jonas", "owner"), account("anna", "admin")], "jonas")).toBe(
      "last-owner",
    );
    // An owner who left counts no more
    expect(
      companyFate(
        [account("jonas", "owner"), account("anna", "member"), account("max", "owner", 3)],
        "jonas",
      ),
    ).toBe("last-owner");
  });

  it("lets an owner go when another owner remains, and anyone who is no owner", () => {
    expect(companyFate([account("jonas", "owner"), account("anna", "owner")], "jonas")).toBe(
      "leave",
    );
    // One other owner among members is enough
    expect(
      companyFate(
        [account("jonas", "owner"), account("max", "member"), account("anna", "owner")],
        "jonas",
      ),
    ).toBe("leave");
    expect(companyFate([account("jonas", "admin"), account("anna", "member")], "jonas")).toBe(
      "leave",
    );
    expect(companyFate([account("jonas", "member"), account("anna", "owner")], "jonas")).toBe(
      "leave",
    );
  });
});
