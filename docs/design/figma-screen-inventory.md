# Figma screen inventory (mobile)

Generated from the Figma MCP `get_metadata` output (frame names, positions and text content). It maps the flows on the mobile page to node IDs so agents and tickets can point at screens without opening 217 frames. It is an index, not a spec: no screen was visually inspected while generating it.

## Source

- File: `LIBRAS-STICKER-SHEET`, file key `EOIAoD0EVDSadk1fPbJlG6`
- URL: https://www.figma.com/design/EOIAoD0EVDSadk1fPbJlG6/LIBRAS-STICKER-SHEET
- Mobile page: `LIBRAS HIGH FID FOR MOBILE`, node `119:894` (217 frames, 212 usable: 392 to 396 are excluded)
- Admin page: `LIBRAS ADMIN HIGH FID`, node `1057:7788`. OUT OF SCOPE for the mobile-first effort.
- Other pages (not read): `FINAL  LIST OF COMPONENTS` `318:6689`, `components` `943:1877`, `DRAFT I archive` `184:2473`

## How to use a node ID

Pass the file key and the node ID (use `-` or `:` in the ID) to the Figma MCP `get_design_context` for a screen, or `get_screenshot` for a quick look. Do not call `get_metadata` on the whole mobile page: it returns about 1 MB. Query one flow frame at a time.

## Account types (domain terms)

The sign-up flow forks by account type: UMAK Student, Faculty, NTP / Employee, Visitor, Alumni. These match the "Who's Logged In" categories on the admin dashboard. Use these exact terms in `GLOSSARY.md`.

## Design tokens and libraries (checked)

- `get_variable_defs` on a sample screen (`121:902`) returned only 4 variables: Montserrat Regular 26, 35 and 16, and `#000000`. Colors, spacing and radii are not defined as variables, so `get_design_context` will return raw values for them.
- No shared libraries are added to the file. Component pages exist (`FINAL  LIST OF COMPONENTS`, `components`) but were not read.
- Font: Montserrat.

## Flows

| Flow | Frames |
|---|---|
| DO NOT USE: frames 392 to 396 | 5 |
| Unverified: frame 391 | 1 |
| Onboarding - Alumni | 29 |
| Onboarding - Visitor | 32 |
| Onboarding - NTP / Employee | 30 |
| Onboarding - Faculty | 30 |
| Onboarding - UMAK Student | 30 |
| Sign in with UMAK email | 9 |
| Login with account | 7 |
| Home dashboard | 2 |
| Profile account | 2 |
| Search | 6 |
| Change password | 5 |
| Hamburger menu | 4 |
| Notifications | 5 |
| Saved books catalogue | 5 |
| Removing saved books | 2 |
| Settings | 7 |
| Choosing a book (borrow flow) | 6 |

### DO NOT USE: frames 392 to 396

Excluded by the project owner. These sit at far right (x >= 10328) with non-phone sizes (widths 720, 874, 875 or height 889). Do not build from them, do not create tickets for them.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 392 | `1082:7932` | HEADER; SIGN UP |
| iPhone 17 - 393 | `1082:7964` |  |
| iPhone 17 - 394 | `1082:7984` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 396 | `1082:8033` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 395 | `1082:8008` | HEADER; SIGN UP; continue with umak email |

### Unverified: frame 391

Frame 391 (402x874) sits alone at far right, next to the excluded frames but a normal phone size. Its status was not confirmed. Ask before building from it.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 391 | `1057:7789` | HEADER; SIGN UP; continue with umak email |

### Onboarding - Alumni

Account-type specific sign-up. Rows of near-duplicate state variants (field empty, filled, error, consent). Left to right: landing, Step 2 profile form states, Step 4 email verification states, ending on Home.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 332 | `909:11813` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 331 | `909:11751` | Create your profile; create an account so you can manage your book journey; Sele |
| iPhone 17 - 361 | `909:13307` | First name *; Cobby; Middle name (optional) |
| iPhone 17 - 360 | `909:13254` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 359 | `909:13201` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 358 | `909:13148` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 357 | `909:13095` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 356 | `909:13042` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 362 | `909:13360` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 355 | `909:12986` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 354 | `909:12930` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 352 | `909:12806` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 341 | `909:12191` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 342 | `909:12247` | Create your profile; create an account so you can manage your book journey; Year |
| iPhone 17 - 345 | `909:12415` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 346 | `909:12471` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 347 | `909:12528` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 348 | `909:12584` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 349 | `909:12638` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 351 | `909:12751` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 350 | `909:12694` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 338 | `909:12056` | Enter email *; Enter your email; Progress label |
| iPhone 17 - 339 | `909:12098` | Almost finished, just a little more; Enter email *; Enter your email |
| iPhone 17 - 340 | `909:12140` | cobbybaldonado@gmail.com; Progress label; Step number |
| iPhone 17 - 337 | `909:12028` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 335 | `909:11958` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 336 | `909:11988` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 334 | `909:11918` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 381 | `1032:2825` | Book of the month!; You might also like these; Children |

### Onboarding - Visitor

Account-type specific sign-up. Rows of near-duplicate state variants (field empty, filled, error, consent). Left to right: landing, Step 2 profile form states, Step 4 email verification states, ending on Home.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 151 | `862:4147` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 150 | `862:4085` | Create your profile; create an account so you can manage your book journey; Sele |
| iPhone 17 - 294 | `909:8718` | First name *; Cobby; Middle name (optional) |
| iPhone 17 - 293 | `909:8665` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 292 | `909:8612` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 291 | `909:8559` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 290 | `909:8506` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 289 | `909:8453` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 295 | `909:8771` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 288 | `909:8398` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 287 | `909:8343` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 286 | `909:8294` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 285 | `909:8239` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 277 | `909:7793` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 296 | `909:9825` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 297 | `909:9882` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 298 | `909:9996` | Create your profile; create an account so you can manage your book journey; Vali |
| iPhone 17 - 278 | `909:7848` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 279 | `909:7904` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 280 | `909:7961` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 281 | `909:8017` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 282 | `909:8071` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 284 | `909:8184` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 283 | `909:8127` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 274 | `909:7658` | Enter email *; Enter your email; Progress label |
| iPhone 17 - 275 | `909:7700` | Almost finished, just a little more; Enter email *; Enter your email |
| iPhone 17 - 276 | `909:7742` | cobbybaldonado@gmail.com; Progress label; Step number |
| iPhone 17 - 273 | `909:7630` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 271 | `909:7560` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 272 | `909:7590` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 270 | `909:7520` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 380 | `1032:2737` | Book of the month!; You might also like these; Children |

### Onboarding - NTP / Employee

Account-type specific sign-up. Rows of near-duplicate state variants (field empty, filled, error, consent). Left to right: landing, Step 2 profile form states, Step 4 email verification states, ending on Home.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 130 | `862:3148` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 129 | `862:3086` | Create your profile; create an account so you can manage your book journey; Sele |
| iPhone 17 - 258 | `909:5815` | First name *; Cobby; Middle name (optional) |
| iPhone 17 - 257 | `909:5762` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 256 | `909:5709` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 255 | `909:5656` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 254 | `909:5603` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 253 | `909:5550` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 259 | `909:5868` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 252 | `909:5495` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 251 | `909:5440` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 250 | `909:5391` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 249 | `909:5336` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 241 | `909:4890` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 242 | `909:4945` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 243 | `909:5001` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 244 | `909:5058` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 245 | `909:5114` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 246 | `909:5168` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 248 | `909:5281` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 247 | `909:5224` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 266 | `909:6179` | Enter email *; Enter your email; Progress label |
| iPhone 17 - 267 | `909:6221` | Almost finished, just a little more; Enter email *; Enter your email |
| iPhone 17 - 268 | `909:6263` | cobbybaldonado@gmail.com; Progress label; Step number |
| iPhone 17 - 265 | `909:6148` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 263 | `909:6078` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 264 | `909:6108` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 262 | `909:6038` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 379 | `1032:2649` | Book of the month!; You might also like these; Children |
| iPhone 17 - 261 | `909:5998` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |

### Onboarding - Faculty

Account-type specific sign-up. Rows of near-duplicate state variants (field empty, filled, error, consent). Left to right: landing, Step 2 profile form states, Step 4 email verification states, ending on Home.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 108 | `862:2086` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 128 | `862:3023` | Create your profile; create an account so you can manage your book journey; Sele |
| iPhone 17 - 224 | `900:4078` | First name *; Cobby; Middle name (optional) |
| iPhone 17 - 223 | `900:4025` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 222 | `900:3972` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 221 | `900:3919` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 220 | `900:3866` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 219 | `900:3813` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 225 | `900:4134` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 218 | `900:3758` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 217 | `900:3703` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 216 | `900:3654` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 215 | `900:3599` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 207 | `900:3151` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 208 | `900:3206` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 209 | `900:3262` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 210 | `900:3319` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 211 | `900:3375` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 212 | `900:3429` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 214 | `900:3544` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 213 | `900:3485` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 238 | `900:4727` | Enter email *; Enter your email; Progress label |
| iPhone 17 - 239 | `900:4769` | Almost finished, just a little more; Enter email *; Enter your email |
| iPhone 17 - 240 | `900:4811` | cobbybaldonado@gmail.com; Progress label; Step number |
| iPhone 17 - 237 | `900:4696` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 235 | `900:4626` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 236 | `900:4656` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 234 | `900:4586` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 377 | `1032:2473` | Book of the month!; You might also like these; Children |
| iPhone 17 - 233 | `900:4546` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |

### Onboarding - UMAK Student

Account-type specific sign-up. Rows of near-duplicate state variants (field empty, filled, error, consent). Left to right: landing, Step 2 profile form states, Step 4 email verification states, ending on Home.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 89 | `617:3622` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 107 | `853:1890` | Create your profile; create an account so you can manage your book journey; Sele |
| iPhone 17 - 36 | `530:941` | First name *; Cobby; Middle name (optional) |
| iPhone 17 - 37 | `553:941` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 38 | `553:966` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 39 | `553:991` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 40 | `553:1016` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 41 | `553:1041` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 49 | `843:873` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 50 | `553:3221` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 51 | `553:3254` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 52 | `553:3437` | By continuing, you agree to libras Consumer Terms and Usage Policy, and acknowle |
| iPhone 17 - 53 | `553:3487` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 54 | `553:3585` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 98 | `843:949` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 99 | `843:998` | Create your profile; create an account so you can manage your book journey; Prog |
| iPhone 17 - 100 | `843:1068` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 101 | `843:1101` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 102 | `843:1131` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 103 | `843:1170` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 104 | `843:1200` | Create your profile; create an account so you can manage your book journey; User |
| iPhone 17 - 200 | `893:1156` | Enter email *; Enter your email; Progress label |
| iPhone 17 - 201 | `893:1198` | Almost finished, just a little more; Enter email *; Enter your email |
| iPhone 17 - 202 | `893:1240` | cobbybaldonado@gmail.com; Progress label; Step number |
| iPhone 17 - 231 | `900:4414` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 229 | `900:4344` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 230 | `900:4374` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 228 | `900:4304` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 378 | `1032:2561` | Book of the month!; You might also like these; Children |
| iPhone 17 - 227 | `900:4264` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |

### Sign in with UMAK email

Label: CONTINUE WITH UMAK EMAIL. Email entry, then check-your-email states.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 1 | `121:902` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 2 | `126:1913` | UNIVERSITY OF MAKATI; continue with umak email; By continuing, you agree to libr |
| iPhone 17 - 3 | `126:1934` | UNIVERSITY OF MAKATI; cobbybaldonado@gmail.com; By continuing, you agree to libr |
| iPhone 17 - 4 | `126:1951` | UNIVERSITY OF MAKATI; cobbybaldonado@gmail.com; By continuing, you agree to libr |
| iPhone 17 - 5 | `126:1984` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 6 | `126:2066` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 7 | `126:2091` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 8 | `126:2125` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |
| iPhone 17 - 67 | `553:4137` | Check your email to finish signing in; We sent an email to; Cobbybaldonado@gmail |

### Login with account

Label: LOGIN WITH ACCOUNT, with ERROR MESSAGE and CORRECTION annotations (invalid email cases).

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 10 | `140:2` | HEADER; SIGN UP; continue with umak email |
| iPhone 17 - 9 | `136:2163` | The library for problem solver; Email; password |
| iPhone 17 - 105 | `845:1239` | The library for problem solver; cbaldonado.k1225765@umak.edu.ph; password |
| iPhone 17 - 106 | `845:1297` | The library for problem solver; cbaldonado.k1225765@umak.edu.ph; pogigexdi |
| iPhone 17 - 13 | `140:1933` | UNIVERSITY OF MAKATI; invalid email; Please enter a valid email address |
| iPhone 17 - 14 | `140:1953` | UNIVERSITY OF MAKATI; Enter email; invalid password |
| iPhone 17 - 96 | `782:730` | UNIVERSITY OF MAKATI; Cobbybaldonado@gmail,com; cobbypogixddxd12345 |

### Home dashboard

Label: HOME DASHBOARD (left column).

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 375 | `1032:1994` | Book of the month!; You might also like these; Children |
| iPhone 17 - 374 | `1032:1904` | Book of the month!; You might also like these; Children |

### Profile account

Label: Profile account. Profile and My Account screens.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 78 | `572:1468` | Profile; COBBY BALDONADO; cbaldonado.k12256165@umak.edu.ph |
| iPhone 17 - 79 | `580:1742` | My Account; Full name; Cobby baldonado |

### Search

Label: SEARCHING COMPONENTS. Home with search, then Search A history, B suggestions, C best guess, D sort dropdown.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 389 | `1045:6738` | Hi, Cobby Whats on your mind; what’s on your mind; Book of the month! |
| iPhone 17 - 390 | `1045:6828` | Book of the month!; You might also like these; Children |
| Search A - History | `1057:6916` | Greeting; Subgreeting; Section title |
| Search B - Suggestions | `1057:7072` | Greeting; Subgreeting; Section title |
| Search C - Best guess | `1057:7230` | Greeting; Subgreeting; Section title |
| Search D - Sort dropdown | `1057:7391` | Greeting; Subgreeting; Section title |

### Change password

Label: CHANGE \ PASSWORD. Four state frames then success.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 363 | `926:14226` | Title; Helper; Current Password |
| iPhone 17 - 364 | `926:14410` | Title; Helper; Current Password |
| iPhone 17 - 365 | `926:14476` | Title; Helper; Current Password |
| iPhone 17 - 366 | `926:14542` | Title; Helper; Current Password |
| Change Password 04 - Success | `928:14929` | Title; Helper; Current Password |

### Hamburger menu

Label: HAMBURGER MENU. Home with the menu drawer in different states.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 367 | `1032:673` | Book of the month!; You might also like these; Children |
| iPhone 17 - 368 | `1032:763` | Book of the month!; You might also like these; Children |
| iPhone 17 - 19 | `232:3252` | Book of the month!; You might also like these; Children |
| iPhone 17 - 386 | `1045:5047` | Book of the month!; You might also like these; Children |

### Notifications

Label: Notification Screens. Home badge, then All, Reminders, Announcements, Activity tabs.

| Frame | Node ID | Hint |
|---|---|---|
| Home / Notification Badge | `1032:853` | Section Heading / Book of the Month; Section Heading / Recommendations; Section  |
| Notifications / All | `271:5649` | Section Heading / Today; Section Heading / Earlier; Notification / Title |
| Notifications / Reminders | `572:962` | Section Heading / Today; Section Heading / Earlier; Notification / Title |
| Notifications / Announcements | `288:5834` | Section Heading / Today; Section Heading / Earlier; Notification / Title |
| Notifications / Activity | `1045:6473` | Section Heading / Today; Section Heading / Earlier; Notification / Title |

### Saved books catalogue

Label: SAVED BOOKS CATALOGUE. Saved list, empty state ("oops nothing to see here"), and variants.

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 370 | `1032:1454` | Book of the month!; You might also like these; Children |
| Frame | `299:6057` | Your saved books; To kill a mockingbird; Boss dogs |
| iPhone 17 - 33 | `310:6250` | Your saved books; To kill a mockingbird; Harper Lee |
| iPhone 17 - 35 | `318:6569` | oops nothing to see here...; Your saved books |
| iPhone 17 - 384 | `1036:4166` | Your saved books; To kill a mockingbird; Harper Lee |

### Removing saved books

Label: REMOVING SAVED BOOKS. Remove mode.

| Frame | Node ID | Hint |
|---|---|---|
| Saved Books / Remove Mode | `1042:4552` | Status Bar / Time; Heading / Your Saved Books; Book Title / To Kill a Mockingbir |
| iPhone 17 - 385 | `1042:4642` | Your saved books; To kill a mockingbird; Harper Lee |

### Settings

Label: SETTINGS (notifications, about), and Terms of Service sub-screens (label TERMS OF SERVICE).

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 371 | `1032:1544` | Book of the month!; You might also like these; Children |
| iPhone 17 - 388 | `1045:5849` | Book of the month!; You might also like these; Children |
| iPhone 17 - 387 | `1045:5671` | Book of the month!; You might also like these; Children |
| iPhone 17 - 80 | `586:1881` | Notifications; About; Settings |
| iPhone 17 - 93 | `617:3912` | Notifications; About; Settings |
| iPhone 17 - 94 | `630:3991` | Notifications; About; Settings |
| iPhone 17 - 95 | `636:705` | 4. Borrowing books; • Borrow up to 3 books at a time for 7 days.; • Tap Borrow a |

### Choosing a book (borrow flow)

Label: CHOOSING A BOOK. Book detail, "Show this to the librarian" QR code screen, "Successfully Borrowed".

| Frame | Node ID | Hint |
|---|---|---|
| iPhone 17 - 372 | `1032:1634` | Book of the month!; You might also like these; Children |
| iPhone 17 - 373 | `1032:1724` | Book of the month!; You might also like these; Children |
| iPhone 17 - 86 | `609:1066` | Book of the month!; You might also like these; Children |
| iPhone 17 - 87 | `617:3265` | Show this to the librarian; Ask the librarian to scan this code to borrow your b |
| iPhone 17 - 88 | `617:3485` | Successfully Borrowed; The librarian scanned your code. Enjoy your book !; Pleas |
| iPhone 17 - 376 | `1032:2326` | Book of the month!; You might also like these; Children |

## Caveats

- Grouping is inferred from the canvas layout (rows under each canvas label), not from Figma sections. If a frame is in the wrong flow, fix this file.
- Frame names are auto-generated (`iPhone 17 - 332`). Many frames are near-duplicate state variants. Open the frame before relying on a hint.
- The Hint column is the first text strings inside the frame. Garbled characters in some Tagalog or bullet text were dropped.
- Two dropdown frames (`909:8331` and `909:12918`, "Grade Level Dropdown") are component-like and not listed above.
- Refresh this file after design changes by re-running `get_metadata` on the mobile page and regrouping.
