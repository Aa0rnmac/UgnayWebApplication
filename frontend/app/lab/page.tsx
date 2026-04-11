import { permanentRedirect } from "next/navigation";

export default function LabRedirectPage() {
  permanentRedirect("/gesture-tester");
}
