import { redirect } from "next/navigation";
import { START_PATH } from "@/components/nav-items";

/**
 * Start page = only a signpost: always opens the Dagplanning (START_PATH),
 * on phone and desktop alike. Other screens are reachable via the navigation.
 */
export default function Home() {
  redirect(START_PATH);
}
