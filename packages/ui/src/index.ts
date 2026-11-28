// The shared interface of the web app, the extension and the mobile app: components (K-301,
// DESIGN.md) and the texts, compiled by Paraglide from messages/de.json and messages/en.json.

export { anchoredBelow, anchorName } from "./components/anchor.ts";
export { Badge, type BadgeProps, type BadgeVariant, badgeVariants } from "./components/badge.tsx";
export { Button, type ButtonProps, buttonClass, IconButton } from "./components/button.tsx";
export { Checkbox, type CheckboxProps, Switch } from "./components/checkbox.tsx";
export { Combobox, type ComboboxProps, matching } from "./components/combobox.tsx";
export { CountDot } from "./components/count-dot.tsx";
export { Dialog, DialogFooter, type DialogProps, dialogClass } from "./components/dialog.tsx";
export { Icon, type IconProps } from "./components/icon.tsx";
export {
  Input,
  type InputProps,
  SearchInput,
  TextArea,
  type TextAreaProps,
} from "./components/input.tsx";
export { List, type ListItem, type ListProps } from "./components/list.tsx";
export { Menu, type MenuItem, type MenuProps } from "./components/menu.tsx";
export { introClass, pageClass, panelClass, panelTitleClass } from "./components/page.ts";
export { Popover, type PopoverProps } from "./components/popover.tsx";
export { selectClass } from "./components/select.ts";
export { type Tab, Tabs, type TabsProps } from "./components/tabs.tsx";
export { createToasts, TOAST_MS, type Toast, Toaster, type Toasts } from "./components/toast.tsx";
export { toggleVariants } from "./components/toggle.ts";
export { Tooltip, type TooltipProps } from "./components/tooltip.tsx";
export { TooltipIconButton } from "./components/tooltip-button.tsx";
export { cn } from "./lib/cn.ts";
export { copyText } from "./lib/copy.ts";
export { nextIndex, type Orientation } from "./lib/keys.ts";
export { type VariantProps, variants } from "./lib/variants.ts";
export { m } from "./paraglide/messages.js";
export type { Locale } from "./paraglide/runtime.js";
export { getLocale, locales, setLocale } from "./paraglide/runtime.js";
