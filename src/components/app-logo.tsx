import { LOGO_FULL_SRC, LOGO_MARK_SRC } from "@/lib/brand";

/** Full logo (two trees + "CIS TUINONDERHOUD"), for the auth pages. */
export function AppLogoFull({ className = "" }: { className?: string }) {
  return <img src={LOGO_FULL_SRC} alt="Cis Tuinonderhoud" width={480} height={480} className={className} />;
}

/** Trees only, for compact places such as the sidebar header. */
export function AppLogoMark({ className = "" }: { className?: string }) {
  return <img src={LOGO_MARK_SRC} alt="" aria-hidden width={256} height={191} className={className} />;
}
