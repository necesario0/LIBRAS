import { facultyDetailsSchema } from "@libras/shared";
import { CollegeIdStep } from "../../src/sign-up/CollegeIdStep";
import { useSignUp } from "../../src/sign-up/SignUpContext";

/** Step 2 of 4 (Figma "iPhone 17 - 207"): what only a Faculty member gives. */
export default function FacultyScreen() {
  const { draft, update } = useSignUp();

  return (
    <CollegeIdStep
      idLabel="Faculty number"
      idValue={draft.facultyNumber}
      onIdChange={(facultyNumber) => update({ facultyNumber })}
      idSchema={facultyDetailsSchema.shape.facultyNumber}
      idCapitalize="characters"
      testPrefix="faculty"
    />
  );
}
