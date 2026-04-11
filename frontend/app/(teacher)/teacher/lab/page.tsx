import { permanentRedirect } from "next/navigation";

export default function TeacherLabRedirectPage() {
  permanentRedirect("/teacher/gesture-tester");
}
