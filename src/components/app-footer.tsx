import { cn } from "@/lib/utils";

interface AppFooterProps {
  variant?: "signature" | "live";
  className?: string;
}

const footerCopy = {
  headline: "Built exclusively for the Mothership syndicate",
  detail:
    "App development orchestrated by Ryan Milton, Letteer Lewis, and Evan Uhland. Code written by AI."
};

export function AppFooter({
  variant = "signature",
  className
}: AppFooterProps) {
  return (
    <footer className={cn("app-footer", `app-footer--${variant}`, className)}>
      <p className="app-footer__headline">{footerCopy.headline}</p>
      <p className="app-footer__detail">{footerCopy.detail}</p>
    </footer>
  );
}
