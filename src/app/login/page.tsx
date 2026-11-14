import type { Metadata } from "next";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign In — open-autoDM",
  description: "Sign in to your open-autoDM automation console.",
};

export default function LoginPage() {
  return <LoginClient />;
}
