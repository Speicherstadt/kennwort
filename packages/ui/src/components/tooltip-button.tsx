/** A ghost icon button whose label also shows as a tooltip on hover and focus (DESIGN.md) */
import { omit } from "solid-js";
import { type ButtonProps, IconButton } from "./button.tsx";
import { Tooltip } from "./tooltip.tsx";

export const TooltipIconButton = (props: Omit<ButtonProps, "size"> & { label: string }) => (
  <Tooltip text={props.label}>
    {(trigger) => (
      <IconButton
        {...omit(props, "onFocus", "onBlur", "onKeyDown", "style")}
        {...trigger}
        // The label is the accessible name already; the tooltip only shows it
        aria-describedby={undefined}
      />
    )}
  </Tooltip>
);
