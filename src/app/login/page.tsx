import { LoginForm } from "./login-form";

export const metadata = { title: "Přihlášení" };

export default function LoginPage() {
  return (
    <main className="login">
      <LoginForm />
    </main>
  );
}
