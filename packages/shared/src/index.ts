export type { ApiErrorBody, HealthResponse } from "./api.ts";
export { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "./barcode/code128.ts";
export type { Code128Symbol } from "./barcode/code128.ts";
export {
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
  SIGN_UP_ACCOUNT_TYPES,
  UMAK_EMAIL_DOMAIN,
  accountTypeSchema,
  hasSignUpForm,
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
  SIGN_UP_MESSAGES,
  UMAK_COLLEGES,
  VERIFICATION_CODE_LENGTH,
  contactNumberSchema,
  emailSchema,
  nameSchema,
  optionalNameSchema,
  passwordSchema,
  resendSignUpCodeRequestSchema,
  signUpRequestSchema,
  studentNumberSchema,
  umakCollegeSchema,
  umakStudentDetailsSchema,
  umakStudentSignUpSchema,
  usernameSchema,
  verificationCodeSchema,
  verifySignUpRequestSchema,
} from "./sign-up.ts";
export type {
  ParsedSignUpRequest,
  ResendSignUpCodeRequest,
  SignUpRequest,
  UmakCollege,
  UmakStudentDetails,
  VerifySignUpRequest,
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
  CATALOG_SEARCH_DEFAULT_LIMIT,
  CATALOG_SEARCH_MAX_LIMIT,
  CATALOG_SEARCH_MAX_QUERY_LENGTH,
  CATALOG_SEARCH_MESSAGES,
  catalogSearchQuerySchema,
} from "./catalog.ts";
export type { BookSearchResult, CatalogSearchQuery, CatalogSearchResponse } from "./catalog.ts";
