import { studentNumberSchema } from "@libras/shared";
import { CollegeIdStep } from "../../src/sign-up/CollegeIdStep";
import { useSignUp } from "../../src/sign-up/SignUpContext";

/** Step 2 of 4 (Figma "iPhone 17 - 53"): what only a UMAK Student gives. */
export default function StudentScreen() {
  const { draft, update, fieldErrors, setFieldErrors } = useSignUp();

  return (
    <CollegeIdStep
      idLabel="Student number"
      idValue={draft.studentNumber}
      onIdChange={(studentNumber) => {
        update({ studentNumber });
        if (fieldErrors.studentNumber !== undefined) setFieldErrors({ ...fieldErrors, studentNumber: undefined });
      }}
      idSchema={studentNumberSchema}
      idServerError={fieldErrors.studentNumber}
      idCapitalize="characters"
      testPrefix="student"
    />
  );
}
