# Changelog

## [1.12.0](https://github.com/trycompai/crm/compare/v1.11.0...v1.12.0) (2026-08-11)


### Features

* edit a deployed agent, and show what Slack actually granted (CMP-77) ([#109](https://github.com/trycompai/crm/issues/109)) ([76b443a](https://github.com/trycompai/crm/commit/76b443ae4fe2567c5c5e51465a82db5faa1f3e62))

## [1.11.0](https://github.com/trycompai/crm/compare/v1.10.0...v1.11.0) (2026-08-11)


### Features

* **app:** copy the tracking snippet for the selected install method ([#128](https://github.com/trycompai/crm/issues/128)) ([30e0137](https://github.com/trycompai/crm/commit/30e01377781559375c3a58ada50b63016dea7d57))

## [1.10.0](https://github.com/trycompai/crm/compare/v1.9.0...v1.10.0) (2026-08-11)


### Features

* **tracking:** support installing the tracking tag via Google Tag Manager ([#124](https://github.com/trycompai/crm/issues/124)) ([2d8129c](https://github.com/trycompai/crm/commit/2d8129ccdd75ca2630289f4bf0cacd04505150b3))

## [1.9.0](https://github.com/trycompai/crm/compare/v1.8.2...v1.9.0) (2026-08-11)


### Features

* **agent:** stop suggesting a URL that already matches the field ([#120](https://github.com/trycompai/crm/issues/120)) ([ed43055](https://github.com/trycompai/crm/commit/ed43055be2885a2de29f16374b07b3e077cace22))

## [1.8.2](https://github.com/trycompai/crm/compare/v1.8.1...v1.8.2) (2026-08-11)


### Fixes

* **agent:** fill blank fields on the dispatch tick instead of sign-in ([#117](https://github.com/trycompai/crm/issues/117)) ([9660952](https://github.com/trycompai/crm/commit/96609529f9f7be27441a88267a05e9a6c8f9c23c))

## [1.8.1](https://github.com/trycompai/crm/compare/v1.8.0...v1.8.1) (2026-08-11)


### Fixes

* **ci:** ship releases by opening a pull request into release ([#114](https://github.com/trycompai/crm/issues/114)) ([924060b](https://github.com/trycompai/crm/commit/924060bac114d7fba6681c6b1b2f38de19f36440))

## [1.8.0](https://github.com/trycompai/crm/compare/v1.7.0...v1.8.0) (2026-08-11)


### Features

* **agent:** apply sourced facts to empty fields automatically ([#112](https://github.com/trycompai/crm/issues/112)) ([0342c8e](https://github.com/trycompai/crm/commit/0342c8ee62561c8df1db16644c2b049617c908a0))

## [1.7.0](https://github.com/trycompai/crm/compare/v1.6.1...v1.7.0) (2026-08-11)


### Features

* **db:** add peek script for inspecting database contents ([#110](https://github.com/trycompai/crm/issues/110)) ([acae8ec](https://github.com/trycompai/crm/commit/acae8ec1ab29851ec66a8a1e8e89672bef6e7eca))

## [1.6.1](https://github.com/trycompai/crm/compare/v1.6.0...v1.6.1) (2026-08-11)


### Fixes

* **ci:** fall back to the pushed commit when release-please reports no sha ([d1efd97](https://github.com/trycompai/crm/commit/d1efd9730570730fc569d124f2c74559d47fe790))
* **ci:** make a release one pull request instead of two ([206c746](https://github.com/trycompai/crm/commit/206c7461e75ee4827960ec07a02843d107514f20))

## [1.6.0](https://github.com/trycompai/crm/compare/v1.5.1...v1.6.0) (2026-08-11)


### Features

* **tracking:** add website tracking with form capture and attribution ([e050ff9](https://github.com/trycompai/crm/commit/e050ff9cd62897880da6cceebe765d51aef8f723))


### Fixes

* **ci:** make the release guard reject only genuinely untagged pull requests ([#105](https://github.com/trycompai/crm/issues/105)) ([815a832](https://github.com/trycompai/crm/commit/815a832fbefe4c96ad15cee1679be116e590e132))
* **ci:** stop the auto-titler downgrading a release ([8a1e390](https://github.com/trycompai/crm/commit/8a1e3901ec5e6eeca13b0b0af4c3edbc0e57736d))

## [1.5.1](https://github.com/trycompai/crm/compare/v1.5.0...v1.5.1) (2026-08-08)


### Fixes

* **api:** warn when the deployed schema does not match schema.prisma ([#88](https://github.com/trycompai/crm/issues/88)) ([f445c68](https://github.com/trycompai/crm/commit/f445c68a815ad1635498591daa494d18d9508ccf))

## [1.5.0](https://github.com/trycompai/crm/compare/v1.4.0...v1.5.0) (2026-08-08)


### Features

* **agent:** bound agent builder retries and improve chat scrolling ([#89](https://github.com/trycompai/crm/issues/89)) ([7780f81](https://github.com/trycompai/crm/commit/7780f81a219813fcf54e6b5dd612a7d40e31d32b))


### Fixes

* **agent:** declare granted write actions in draft access summary ([#93](https://github.com/trycompai/crm/issues/93)) ([ad4f9f3](https://github.com/trycompai/crm/commit/ad4f9f31c81fd6bdad89abb6adb5a208d51c19ed))
* **app:** render agent transcript chronologically with anchored tool results ([#92](https://github.com/trycompai/crm/issues/92)) ([0e68e45](https://github.com/trycompai/crm/commit/0e68e45909182c875ea58ba18fb89d9a87032e11))

## [1.4.0](https://github.com/trycompai/crm/compare/v1.3.0...v1.4.0) (2026-08-07)


### Features

* **agent:** CMP-1 add sandboxed builder and runner runtimes ([#60](https://github.com/trycompai/crm/issues/60)) ([d033dbf](https://github.com/trycompai/crm/commit/d033dbf0a0bc966499454a402219b65130b6397a))
* **app:** CMP-12 review agent drafts before deployment ([#63](https://github.com/trycompai/crm/issues/63)) ([51a4a11](https://github.com/trycompai/crm/commit/51a4a118432863980c88dc0f7c0d9e56aa4462ae))
* **app:** CMP-46 add the private agent builder workspace ([#62](https://github.com/trycompai/crm/issues/62)) ([f64c88f](https://github.com/trycompai/crm/commit/f64c88fe9d3e1a72e67e630f01817f75cfddaedd))
* **app:** CMP-47 add inline composer context ([57336ab](https://github.com/trycompai/crm/commit/57336abc2cc5d599aa1467bae0345482ac3de1d5))
* **db:** CMP-1 persist durable custom agents ([#67](https://github.com/trycompai/crm/issues/67)) ([4e79f83](https://github.com/trycompai/crm/commit/4e79f837dba6654806a1d3f99632ec34343a2b6d))


### Fixes

* **app:** CMP-47 consolidate agent builder presentation ([#64](https://github.com/trycompai/crm/issues/64)) ([1809d27](https://github.com/trycompai/crm/commit/1809d277c31f64b2ea3dd44615175b47bcbbda34))
* **app:** move chat beneath overview in icon rail ([#83](https://github.com/trycompai/crm/issues/83)) ([b63497d](https://github.com/trycompai/crm/commit/b63497d07c5c33d119b9d759c81341e422afd8cd))
* **ci:** tag releases automatically and keep previews off the production schema ([#82](https://github.com/trycompai/crm/issues/82)) ([6078a84](https://github.com/trycompai/crm/commit/6078a84b4fa435914f77601dc2c6e67c28de4bc3))


### Refactors

* **app:** CMP-59 harden CRM UI foundations ([#61](https://github.com/trycompai/crm/issues/61)) ([d8123e6](https://github.com/trycompai/crm/commit/d8123e6dd6a02986d0a9211c68dfaa110cdc0901))

## [1.3.0](https://github.com/trycompai/crm/compare/v1.2.0...v1.3.0) (2026-08-07)


### Features

* **api:** add microsoft sign-in and outlook mailbox sync ([#73](https://github.com/trycompai/crm/issues/73)) ([2a0062f](https://github.com/trycompai/crm/commit/2a0062fb76ffdaa5bbbb3848a5573b8b53cd0036))
* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/trycompai/crm/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/trycompai/crm/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/trycompai/crm/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/trycompai/crm/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/trycompai/crm/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/trycompai/crm/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/trycompai/crm/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/trycompai/crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/trycompai/crm/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/trycompai/crm/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/trycompai/crm/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/trycompai/crm/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))


### Fixes

* **app:** generate route types before type checking ([03d4069](https://github.com/trycompai/crm/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/trycompai/crm/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/trycompai/crm/commit/8871e49d153db694933537a6ac28219d7761478b))


### Refactors

* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/trycompai/crm/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/trycompai/crm/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/trycompai/crm/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/trycompai/crm/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/trycompai/crm/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/trycompai/crm/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/trycompai/crm/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/trycompai/crm/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/trycompai/crm/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/trycompai/crm/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/trycompai/crm/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/trycompai/crm/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/trycompai/crm/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/trycompai/crm/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## [1.2.0](https://github.com/trycompai/crm/compare/v1.1.0...v1.2.0) (2026-08-07)


### Features

* **api:** add microsoft sign-in and outlook mailbox sync ([#73](https://github.com/trycompai/crm/issues/73)) ([2a0062f](https://github.com/trycompai/crm/commit/2a0062fb76ffdaa5bbbb3848a5573b8b53cd0036))

## [1.1.0](https://github.com/trycompai/crm/compare/v1.0.0...v1.1.0) (2026-08-06)


### Features

* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/trycompai/crm/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/trycompai/crm/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/trycompai/crm/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/trycompai/crm/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/trycompai/crm/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/trycompai/crm/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/trycompai/crm/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/trycompai/crm/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/trycompai/crm/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/trycompai/crm/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/trycompai/crm/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))


### Fixes

* **app:** generate route types before type checking ([03d4069](https://github.com/trycompai/crm/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/trycompai/crm/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/trycompai/crm/commit/8871e49d153db694933537a6ac28219d7761478b))


### Refactors

* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/trycompai/crm/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/trycompai/crm/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/trycompai/crm/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/trycompai/crm/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/trycompai/crm/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/trycompai/crm/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/trycompai/crm/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/trycompai/crm/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/trycompai/crm/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/trycompai/crm/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/trycompai/crm/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/trycompai/crm/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/trycompai/crm/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/trycompai/crm/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## 1.0.0 (2026-08-03)


### Features

* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/trycompai/crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
