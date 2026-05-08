import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuPortal = DropdownMenuPrimitive.Portal

function DropdownMenuContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={[
          'z-50 min-w-[8rem] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-lg shadow-black/10',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={[
        'relative flex cursor-pointer select-none items-center rounded-xl px-3 py-2 text-sm text-[#374151] outline-none transition',
        'focus:bg-[#f3f4f6] focus:text-[#111827]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={['mx-2 my-1 h-px bg-[#f3f4f6]', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={['px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9ca3af]', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
}
