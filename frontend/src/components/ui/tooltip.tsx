import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Provider>, "delay"> & {
  delayDuration?: number
}) {
  return <TooltipPrimitive.Provider delay={delayDuration} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  side = "top",
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> & {
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"]
  sideOffset?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["sideOffset"]
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          className={cn(
            "z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-xl shadow-slate-300/30 transition data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
