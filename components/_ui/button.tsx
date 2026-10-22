import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none outline-none select-none transition-[background-color,color,scale] duration-base hover:duration-[120ms] ease-out active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:content-['']",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground font-semibold hover:bg-primary-hover",
        secondary: "text-foreground shadow-raised hover:bg-well",
        well: "bg-well text-foreground hover:bg-well-hover",
        ghost: "text-fg-secondary hover:bg-well hover:text-foreground",
        nav: "w-full justify-start active:scale-100 text-sidebar-foreground hover:text-foreground data-[active=true]:bg-overlay-2 data-[active=true]:text-foreground",
        link: "rounded-none active:scale-100 text-foreground underline decoration-from-font underline-offset-2 hover:text-fg-secondary",
      },
      size: {
        xs: "h-control-sm px-2.5 text-xs leading-none",
        sm: "h-8 px-3 text-sm leading-none",
        control: "h-8 px-3 text-sm leading-none",
        toolbar: "h-control-lg px-3.5 text-sm leading-none",
        avatar:
          "h-10 gap-2 py-0.5 pr-3 pl-0.5 text-sm leading-none font-medium pointer-coarse:after:-inset-x-2",
        md: "h-10 px-4 text-sm leading-none",
        lg: "h-11 px-5 text-sm leading-none",
        icon: "relative size-control-md p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
        "icon-xs":
          "relative size-control-xs p-0 after:absolute after:-inset-1.5 after:content-[''] pointer-coarse:after:-inset-3.5",
        "icon-sm":
          "relative size-control-sm p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 pointer-coarse:after:content-['']",
        none: "p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);

type ButtonProps = VariantProps<typeof buttonVariants> &
  ComponentProps<"button"> & {
    href?: ComponentProps<typeof Link>["href"];
    loading?: boolean;
  };

export default function Button({
  variant,
  size,
  className,
  href,
  children,
  type = "button",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(props as Omit<ComponentProps<typeof Link>, "href" | "className">)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={cn(classes, loading && "relative disabled:opacity-100")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="inline-flex items-center [gap:inherit] opacity-0">
            {children}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
