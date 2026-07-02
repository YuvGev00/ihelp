import { AuthForm } from "@/components/AuthForm";
import { signUp } from "@/actions/auth";

export default function SignupPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
