import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@crm/ui/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.25 overflow-hidden rounded-4xl border border-transparent px-3 text-xs font-medium whitespace-nowrap tabular-nums transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:shadow-focus has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20 [a]:hover:bg-destructive/20",
        "scope-read": "border-brand/30 bg-background text-foreground",
        "scope-change": "border-status-warning/40 bg-background text-foreground",
        "scope-sensitive":
          "border-destructive/30 bg-background text-foreground",
        outline:
          "border-border text-foreground [a]:hover:border-input [a]:hover:bg-accent",
        ghost: "[a]:hover:bg-accent",
        link: "text-primary underline-offset-4 [a]:hover:underline",
        mono: "rounded-sm bg-muted font-mono font-normal text-muted-foreground",
        token: "rounded-sm border-border font-normal text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
