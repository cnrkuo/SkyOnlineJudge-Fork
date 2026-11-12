/**
 * Interactive overlays, built on Radix UI. Radix handles focus, keyboard and
 * screen-reader behaviour; these wrappers fix the look and trim the API down
 * to what the app uses, so every menu, select, tooltip and dialog is alike.
 *
 * Rule of thumb: controls inside a <form> that must work without JavaScript
 * stay native; these are for toolbars and one-click actions.
 */
import { AlertDialog, DropdownMenu, Select, Tabs as RadixTabs, Tooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { button } from './kit.css';
import * as css from './overlay.css';

// ---------------------------------------------------------------- tooltip

export const TooltipProvider = Tooltip.Provider;

/** Explains a terse label (verdict codes, icons) on hover or focus. */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={css.tooltip} sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ------------------------------------------------------------------- menu

export function Menu({ label, children, align = 'end' }: { label: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={button({ variant: 'secondary', size: 'sm' })}>
        {label} <span aria-hidden>▾</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={css.menu} align={align} sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className={css.menuLabel}>{children}</DropdownMenu.Label>;
}

export function MenuItem({ children, onSelect, danger = false }: { children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={`${css.menuItem} ${danger ? css.menuItemDanger : ''}`} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}

/** A menu entry that toggles; the menu stays open so several can be flipped. */
export function MenuCheck({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <DropdownMenu.CheckboxItem
      className={css.menuItem}
      checked={checked}
      onCheckedChange={onChange}
      onSelect={(event) => event.preventDefault()}
    >
      <span className={css.menuIndicator}>
        <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

// ----------------------------------------------------------------- select

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Picks one of a few options in a toolbar. An empty-string value cannot be
 * an option (a Radix constraint), so callers use a named "all" value.
 */
export function SelectBox<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  /** Accessible name; the visible label is the caller's `<Field>`. */
  label: string;
  size?: 'md' | 'sm';
}) {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as T)}>
      <Select.Trigger className={`${css.selectTrigger} ${size === 'sm' ? css.selectSmall : ''}`} aria-label={label}>
        <Select.Value />
        <Select.Icon aria-hidden>▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={css.selectContent} position="popper" sideOffset={6}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value} className={css.menuItem}>
                <span className={css.menuIndicator}>
                  <Select.ItemIndicator>✓</Select.ItemIndicator>
                </span>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// ----------------------------------------------------------------- dialog

/**
 * Asks before something irreversible happens. `trigger` is the button the
 * user sees; `onConfirm` runs only after they agree.
 */
export function Confirm({
  trigger,
  title,
  children,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={css.dialogOverlay} />
        <AlertDialog.Content className={css.dialog}>
          <AlertDialog.Title className={css.dialogTitle}>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>{children}</div>
          </AlertDialog.Description>
          <div className={css.dialogActions}>
            <AlertDialog.Cancel className={button({ variant: 'secondary' })}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action className={button({ variant: 'danger' })} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ------------------------------------------------------------------- tabs

/** Switches between views of the same subject inside one card. */
export function Tabs({ tabs }: { tabs: { id: string; label: ReactNode; content: ReactNode }[] }) {
  return (
    <RadixTabs.Root defaultValue={tabs[0]?.id}>
      <RadixTabs.List className={css.tabList}>
        {tabs.map((tab) => (
          <RadixTabs.Trigger key={tab.id} value={tab.id} className={css.tab}>
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.id} value={tab.id}>
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
