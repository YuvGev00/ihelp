import { AuthForm } from "@/components/AuthForm";
import { signIn } from "@/actions/auth";

export default function LoginPage() {
  return <AuthForm mode="signin" action={signIn} />;
}
