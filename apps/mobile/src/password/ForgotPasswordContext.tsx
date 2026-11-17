import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** What the Forgot password screens share: the email the code went to, and the code once it was accepted. */
interface ForgotPassword {
  email: string;
  setEmail: (email: string) => void;
  code: string;
  setCode: (code: string) => void;
}

const ForgotPasswordContext = createContext<ForgotPassword | undefined>(undefined);

/** Holds the Forgot password flow's state. It is forgotten when the flow is left. */
export function ForgotPasswordProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const value = useMemo(() => ({ email, setEmail, code, setCode }), [email, code]);
  return <ForgotPasswordContext.Provider value={value}>{children}</ForgotPasswordContext.Provider>;
}

export function useForgotPassword(): ForgotPassword {
  const value = useContext(ForgotPasswordContext);
  if (value === undefined) throw new Error("useForgotPassword is used outside the Forgot password screens");
  return value;
}
