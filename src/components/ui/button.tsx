import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Buttons are pills. Primary is black ink on paper; secondary/outline is paper with a
 * hairline. Ghost is for quiet in-line controls.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/85",
        outline:
          "border-line-strong bg-paper-raised text-ink hover:border-ink/40 hover:bg-paper aria-expanded:bg-paper-sunk",
        secondary:
          "border-line-strong bg-paper-raised text-ink hover:border-ink/40 hover:bg-paper aria-expanded:bg-paper-sunk",
        ghost:
          "text-ink-soft hover:bg-ink/5 hover:text-ink aria-expanded:bg-ink/5 aria-expanded:text-ink",
        destructive: "bg-wrong-wash text-wrong hover:bg-wrong-wash/70",
        link: "rounded-none text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink",
      },
      size: {
        default: "h-10 gap-2 px-5 text-[0.9375rem]",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
