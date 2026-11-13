export type { ApiErrorBody, HealthResponse } from "./api.ts";
export { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "./barcode/code128.ts";
export type { Code128Symbol } from "./barcode/code128.ts";
export {
  DESK_SESSION_MINUTES,
  DIGITAL_ID_LENGTH,
  DIGITAL_ID_MESSAGES,
  DIGITAL_ID_NUMBER_DIGITS,
  DIGITAL_ID_TOKEN_DIGITS,
  DIGITAL_ID_WINDOW_SECONDS,
  digitalIdCodeSchema,
  formatDigitalId,
  identifyMemberRequestSchema,
  msUntilRefresh,
} from "./digital-id.ts";
export type {
  DeskMember,
  DeskSession,
  DigitalIdResponse,
  IdentifyMemberRequest,
  IdentifyMemberResponse,
  LoanStanding,
} from "./digital-id.ts";
export { SCAN_INPUT_MAX_LENGTH, SCAN_INPUT_PATTERN, SCAN_MESSAGES, readScan } from "./scan.ts";
export type { ScanReading, ScanRejection } from "./scan.ts";
export { refreshSessionRequestSchema, signInRequestSchema } from "./auth.ts";
export type {
  RefreshSessionRequest,
  RefreshSessionResponse,
  Session,
  SignInRequest,
  StaffMeResponse,
  StaffProfile,
  StaffRole,
  StaffSignInResponse,
} from "./auth.ts";
export {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  UMAK_EMAIL_DOMAIN,
  accountTypeSchema,
  canBorrow,
  isUmakEmail,
  requiresUmakEmail,
} from "./accounts.ts";
export type { AccountType } from "./accounts.ts";
export type {
  MemberMeResponse,
  MemberProfile,
  MemberSignInResponse,
  SignUpCodeSentResponse,
  VerifySignUpResponse,
} from "./members.ts";
export {
  ALUMNI_GRADUATION_YEARS,
  SIGN_UP_MESSAGES,
  UMAK_COLLEGES,
  VERIFICATION_CODE_LENGTH,
  VISITOR_ID_TYPES,
  alumniDetailsSchema,
  alumniSignUpSchema,
  contactNumberSchema,
  emailSchema,
  facultyDetailsSchema,
  facultySignUpSchema,
  nameSchema,
  ntpEmployeeDetailsSchema,
  ntpEmployeeSignUpSchema,
  optionalNameSchema,
  passwordSchema,
  requiredContactNumberSchema,
  resendSignUpCodeRequestSchema,
  signUpRequestSchema,
  studentNumberSchema,
  umakCollegeSchema,
  umakStudentDetailsSchema,
  umakStudentSignUpSchema,
  usernameSchema,
  verificationCodeSchema,
  verifySignUpRequestSchema,
  visitorDetailsSchema,
  visitorIdTypeSchema,
  visitorSignUpSchema,
  yearGraduatedSchema,
} from "./sign-up.ts";
export type {
  AlumniDetails,
  FacultyDetails,
  NtpEmployeeDetails,
  ParsedSignUpRequest,
  ResendSignUpCodeRequest,
  SignUpRequest,
  UmakCollege,
  UmakStudentDetails,
  VerifySignUpRequest,
  VisitorDetails,
  VisitorIdType,
  YearGraduated,
} from "./sign-up.ts";
export { buildTrie, searchTrie } from "./search/flat-trie.ts";
export type { FlatTrie, TrieMatch } from "./search/flat-trie.ts";
export { buildCatalogIndex, buildCatalogIndexAsync, normalizeText, tokenize, typoBoundFor } from "./search/catalog-index.ts";
export type {
  CatalogHit,
  CatalogIndex,
  CatalogSearchOptions,
  CatalogSearchResult,
  IndexedBook,
} from "./search/catalog-index.ts";
export {
  BOOK_MESSAGES,
  CATALOG_SEARCH_DEFAULT_LIMIT,
  CATALOG_SEARCH_MAX_LIMIT,
  CATALOG_SEARCH_MAX_QUERY_LENGTH,
  CATALOG_SEARCH_MESSAGES,
  bookIdSchema,
  catalogSearchQuerySchema,
} from "./catalog.ts";
export type { BookDetail, BookDetailResponse, BookSearchResult, CatalogSearchQuery, CatalogSearchResponse } from "./catalog.ts";
export {
  HOLD_MESSAGES,
  HOLD_STATUSES,
  HOLD_STATUS_LABELS,
  holdIdSchema,
  isActiveHold,
  placeHoldRequestSchema,
} from "./holds.ts";
export type { CancelHoldResponse, Hold, HoldStatus, MyHoldsResponse, PlaceHoldRequest, PlaceHoldResponse } from "./holds.ts";
export {
  LIBRARY_UTC_OFFSET_HOURS,
  LOAN_MESSAGES,
  RETURN_MESSAGES,
  confirmLoanRequestSchema,
  copyCodeSchema,
  deskSessionTokenSchema,
  endDeskSessionRequestSchema,
  formatLibraryDate,
  formatLibraryDateTime,
  formatLibraryDay,
  libraryDaysBetween,
  isCurrentLoan,
  isLoanOverdue,
  loanDueAt,
  recordReturnRequestSchema,
} from "./loans.ts";
export type {
  ConfirmLoanRequest,
  ConfirmLoanResponse,
  DeskLoan,
  EndDeskSessionRequest,
  Loan,
  MyLoansResponse,
  RecordReturnRequest,
  RecordReturnResponse,
  ReturnedLoan,
} from "./loans.ts";
export { readEventStream } from "./event-stream.ts";
export type { StreamEvent } from "./event-stream.ts";
export {
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_SECONDS,
  SCANNER_MESSAGES,
  pairScannerRequestSchema,
  pairingCodeSchema,
  sendScanRequestSchema,
} from "./scanner.ts";
export type { DeskScannerEventName, DeskScannerEvents, PairScannerResponse, ScannerStatusResponse } from "./scanner.ts";
