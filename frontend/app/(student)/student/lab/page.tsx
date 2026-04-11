import { permanentRedirect } from "next/navigation";

export default function StudentLabRedirectPage() {
  permanentRedirect("/student/gesture-tester");
}
