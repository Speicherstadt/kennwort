import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox, Switch } from "./checkbox.tsx";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const mount = (view: () => unknown) => {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(view as () => never, root);
  flush();
  return root;
};

// The look is drawn over a real input, so label, keyboard, form value and role stay the browser's
describe("Checkbox and Switch", () => {
  it("keep a real checkbox that its label names and that reports changes", () => {
    const onChange = vi.fn();
    const root = mount(() => (
      <label>
        <Checkbox name="plain-text" onChange={(e) => onChange(e.currentTarget.checked)} />
        Verstanden
      </label>
    ));
    const box = root.querySelector<HTMLInputElement>("input[type=checkbox]");
    expect(box?.name).toBe("plain-text");
    expect(box?.labels?.[0]?.textContent).toContain("Verstanden");
    box?.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("gives the switch role=switch and passes checked and disabled through", () => {
    const root = mount(() => <Switch checked disabled />);
    const input = root.querySelector<HTMLInputElement>("input");
    expect(input?.type).toBe("checkbox");
    expect(input?.getAttribute("role")).toBe("switch");
    expect(input?.checked).toBe(true);
    expect(input?.disabled).toBe(true);
  });
});
