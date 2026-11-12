-- What each Account Type gives at sign-up, kept in `members.details`.
--
-- The API validates the details before a Member is created; these checks are
-- the database's own guard, so a row of one Account Type cannot be missing the
-- keys its form collects. UMAK Student already has its check (members.sql).

alter table public.members
  add constraint members_faculty_details check (
    account_type <> 'faculty' or (details ? 'facultyNumber' and details ? 'college')
  ),
  add constraint members_ntp_employee_details check (
    account_type <> 'ntp_employee' or (details ? 'employeeNumber' and details ? 'college')
  ),
  -- The ID type is optional in the design, so only the number and the institution are required.
  add constraint members_visitor_details check (
    account_type <> 'visitor' or (details ? 'validIdNumber' and details ? 'institution' and contact_number is not null)
  ),
  add constraint members_alumni_details check (
    account_type <> 'alumni' or (details ? 'yearGraduated' and details ? 'alumniIdNumber')
  );
