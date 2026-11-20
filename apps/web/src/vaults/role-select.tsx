/** The role in a vault as a native select (K-305) */
import type { VaultRole } from "@kennwort/core";
import { For } from "solid-js";
import { roleText } from "./vault-text.ts";

const ROLES: VaultRole[] = ["read", "edit", "manage"];
export const selectClass = "h-11 rounded-md border border-border bg-background px-2 text-xs md:h-8";

export const RoleSelect = (props: {
  label: string;
  value: VaultRole;
  disabled: boolean;
  onChange: (role: VaultRole) => void;
}) => (
  <select
    aria-label={props.label}
    class={selectClass}
    disabled={props.disabled}
    value={props.value}
    onChange={(event) => props.onChange(event.currentTarget.value as VaultRole)}
  >
    <For each={ROLES}>{(role) => <option value={role}>{roleText(role)}</option>}</For>
  </select>
);
