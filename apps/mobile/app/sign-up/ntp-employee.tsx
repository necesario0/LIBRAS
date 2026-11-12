import { ntpEmployeeDetailsSchema } from "@libras/shared";
import { CollegeIdStep } from "../../src/sign-up/CollegeIdStep";
import { useSignUp } from "../../src/sign-up/SignUpContext";

/**
 * Step 2 of 4 (Figma "iPhone 17 - 241"): what only an NTP / Employee gives. The
 * frames reuse the Faculty form and still say "Faculty number"; this one asks
 * for the employee number.
 */
export default function NtpEmployeeScreen() {
  const { draft, update } = useSignUp();

  return (
    <CollegeIdStep
      idLabel="Employee number"
      idValue={draft.employeeNumber}
      onIdChange={(employeeNumber) => update({ employeeNumber })}
      idSchema={ntpEmployeeDetailsSchema.shape.employeeNumber}
      idCapitalize="characters"
      testPrefix="ntp"
    />
  );
}
