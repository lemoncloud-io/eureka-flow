# Changelog

## [2026-04-23] - root@0.37.0, @flows/web@0.37.0

### Features

- update landing page

### Refactor

- (ui) simplify and optimize code structure

## [2026-04-21] - root@0.36.0, @flows/web@0.36.0

### Features

- add compact mode to DevSocketPanel

## [2026-04-21] - root@0.35.0, @flows/web@0.35.0

### Features

- update DevSocketPanel

## [2026-04-21] - root@0.34.0, @flows/web@0.34.0, @flows/admin@0.20.0

### Features

- update debug mode
- add AI key warning and dialog
- add api key popup
- add get profile api

## [2026-04-21] - root@0.33.0, @flows/web@0.33.0, @flows/admin@0.19.0

### Features

- add new translations and update existing ones
- add graph view translation
- update socket dev
- add double click event to ports

### Bug Fixes

- reset node state on runId change

### Refactor

- improve port data handling
- improve socket recorder and node replay logic
- improve port update handling

## [2026-04-20] - root@0.32.1, @flows/web@0.32.1

### Bug Fixes

- handle initial flow id

## [2026-04-20] - root@0.32.0, @flows/web@0.32.0, @flows/admin@0.18.0

### Features

- (permissions) enforce role-based UI gating across desktop and mobile editors

## [2026-04-17] - root@0.31.1, @flows/admin@0.17.1

### Bug Fixes

- (i18n) load translations immediately after locale discovery

## [2026-04-17] - root@0.31.0, @flows/web@0.31.0, @flows/admin@0.17.0

### Features

- enable CORS for translation uploads
- (i18n) add API key auth support for presign API requests
- (i18n) add presigned URL upload, dynamic locale discovery, and security hardening
- (i18n) add live sync for translation edits

### Bug Fixes

- (i18n) use URLSearchParams for presign API query encoding
- (i18n) rename presign auth header to x-i18n-key

### Chores

- update S3 bucket to eureka-flows-i18n and add presign env vars to CI

## [2026-04-16] - root@0.30.1, @flows/web@0.30.1

### Chores

- update theme color and add SEO meta tags

## [2026-04-16] - root@0.30.0, @flows/web@0.30.0, @flows/admin@0.16.0

### Features

- update theme
- add interactive guide tour with step change handling
- updat meta and public flow page
- improve thumbnail capture
- add view-only badge, run-all auto-scroll, and quick-add blocks
- add search functionality in mobile editor
- add localization for mobile editor flows
- show occupied port info and replace connect button
- improve mobile-editor ui/ux

### Bug Fixes

- remove unimplemented fitView shortcut from help dialog
- open sidebar when block tutorial starts in editor

### Refactor

- remove examples tab from help dialog, fix FlowMosaic naming
- align block tutorial icons with sidebar emoji icons
- consolidate tutorial menu items from 3 to 2
- redesign sidebar to 2-column card grid and remove unused interactive tutorial
- simplify FrontendBadge component
- unify loading spinners to consistent w-8 border-2 pattern
- simplify loading indicators
- refactor landing
- improve flow card styling and layout
- encode path segments in api requests
- simplify step navigation logic
- update group container styles
- refactor mobile-editor

## [2026-04-15] - root@0.29.0, @flows/web@0.29.0

### Features

- improve tutorial ui/ux
- implement custom guided tour and block tutorial

### Refactor

- improve tutorial flow and steps

## [2026-04-14] - root@0.28.1, @flows/web@0.28.1

### Other

- perf: eliminate canvas re-renders on zoom/pan

## [2026-04-14] - root@0.28.0, @flows/web@0.28.0, @flows/admin@0.15.0

### Features

- add dev role toggle and animations
- update mobile-editor
- add isEditable flag
- support 3-tier setting
- add run all functionality
- add canvas context menu for block selection
- enhance port data retrieval with options
- add node block context menu

### Bug Fixes

- sync pending updates during node execution

### Refactor

- enhance toaster styling
- refactor code
- remove import functionality from header
- replace MoreVertical button with styled div

### Chores

- update error styling
- update button colors for run options

## [2026-04-13] - root@0.27.0, @flows/web@0.27.0, @flows/admin@0.14.0

### Features

- add live trace indicator and run history panel
- remove dnd
- improve mobile UI/UX

### Refactor

- improve visual recognition and styling

### Chores

- resolve merge conflict with develop

## [2026-04-13] - root@0.26.0, @flows/web@0.26.0, @flows/admin@0.13.0

### Features

- add execution stack (RunContext) UI for tracking node run history

### Refactor

- improve run history handling

## [2026-04-13] - root@0.25.0, @flows/web@0.25.0, @flows/admin@0.12.0

### Features

- migrate socket event types and fix WebSocket message processing

## [2026-04-10] - root@0.24.0, @flows/web@0.24.0, @flows/admin@0.11.0

### Features

- add S3 bucket URL for i18n translations
- add node info card and navigation
- enhance FlowGraphView with role colors
- (flows) add custom graph themes and layout switcher
- integrate reagraph

### Refactor

- unify floating bottom toolbar

## [2026-04-10] - root@0.23.0, @flows/web@0.23.0, @flows/admin@0.10.0

### Features

- update mobile page
- support i18n management
- update tutorial, mobile editor
- add mobile editor

### Refactor

- refactor code
- update connection mode to use upsertFlow
- update route paths and add read-only mode

### Chores

- remove images
- temp commit
- temp commit

## [2026-04-09] - root@0.22.1, @flows/web@0.22.1, @flows/admin@0.9.1

### Refactor

- extract driver config and improve tour steps
- refactor code
- remove guided tour feature

## [2026-04-09] - root@0.22.0, @flows/web@0.22.0, @flows/admin@0.9.0

### Features

- add tutorial

### Refactor

- (ui) remove demo mode and enhance API key dialog
- update API endpoint

### Chores

- temp commit

## [2026-04-07] - root@0.21.0, @flows/web@0.21.0, @flows/admin@0.8.0

### Features

- update guided tour
- add guided tour

### Refactor

- simplify codes url handling

## [2026-04-06] - root@0.20.0, @flows/web@0.20.0

### Features

- (flows) add auto-capture canvas as default thumbnail

### Refactor

- extract formatRelativeTime to utils

## [2026-04-03] - root@0.19.0, @flows/web@0.19.0, @flows/admin@0.7.0

### Features

- add error handling for thumbnail upload
- add query for listing public flows
- add thumbnail upload feature
- upload flow thumbnail
- add thumbnail processing and error handling

### Chores

- remove unused camera icon from FlowCard

## [2026-04-03] - root@0.18.0, @flows/web@0.18.0, @flows/admin@0.6.0

### Features

- update tools of admin
- add published status indicator
- add publish and unpublish functionalities
- update ui for explore
- implement share and public
- add BlockIcon for node state display
- (flows) improve run button functionality and sanitize SVG icons
- add run buttons for process nodes
- add run options for node execution
- add BlockIcon component for icons

### Bug Fixes

- correct propagate query param

### Refactor

- (flows) temporarily disable thumbnail functionality
- (api) update flow metadata endpoint
- rename publishTitle to flowName and update references
- extract StatusIcon component
- remove LogModal and related actions
- (flows) remove node disabled state

### Chores

- update landing
- temp commit
- update button icon size for consistency

## [2026-04-01] - root@0.17.0, @flows/web@0.17.0, @flows/admin@0.5.0

### Features

- add PNG export and fix collapse/expand all functionality

## [2026-03-31] - root@0.16.0, @flows/web@0.16.0

### Features

- update landing page

## [2026-03-31] - root@0.15.0, @flows/web@0.15.0, @flows/admin@0.4.0

### Features

- add node collapse/expand and redesign empty state guide
- add toast, map

### Bug Fixes

- freeze minimap bounds during drag to prevent feedback loop
- clamp minimap click position to prevent viewport overshoot
- use square minimap size to prevent elongated aspect ratio
- improve minimap UI proportions and visual quality
- correct collapsed node port Y offset for edge alignment
- use useLocation instead of window.location in EmptyStateGuide
- hide Browse Examples button on examples page

### Refactor

- derive COLLAPSED_PORT_Y from CSS_TOP + PORT_WRAPPER_HEIGHT/2

### Other

- test: add useCanvasStore collapse/expand unit tests

## [2026-03-30] - root@0.14.2, @flows/web@0.14.2, @flows/admin@0.3.2

### Refactor

- improve trace log handling

### Chores

- update stage visualization colors and label width

## [2026-03-27] - root@0.14.1, @flows/web@0.14.1, @flows/admin@0.3.1

### Refactor

- introduce error field for server-side error messages
- make trace entry properties optional

## [2026-03-27] - root@0.14.0, @flows/web@0.14.0, @flows/admin@0.3.0

### Features

- enhance agent block trace log display
- add agent trace log visualization

### Refactor

- simplify message id parsing

### Chores

- clarify trace message requirements

## [2026-03-26] - root@0.13.0, @flows/web@0.13.0, @flows/admin@0.2.0

### Features

- add skills, tools, blocks feature

### Refactor

- simplify form data types
- update button sizes and colors

## [2026-03-26] - root@0.12.0, @flows/web@0.12.0, @flows/admin@0.1.0

### Features

- setup admin and load flow list
- add copy functionality to content preview

### Bug Fixes

- prevent negative total count
- handle API failure and clear sequence numbers
- require API key before initializing flow editor
- simplify deploy script and env loading

### Refactor

- optimize json parsing

### Other

- ci: improve deploy script configuration

## [2026-03-25] - root@0.11.0, @flows/web@0.11.0

### Features

- update README and landing page

## [2026-03-25] - root@0.10.0, @flows/web@0.10.0

### Features

- add policy feature

## [2026-03-24] - root@0.9.0, @flows/web@0.9.0

### Features

- add landing page

## [2026-03-23] - root@0.8.0, @flows/web@0.8.0

### Features

- add retry and reset API key functionality

### Bug Fixes

- correct env variable precedence logic

## [2026-03-20] - root@0.7.0, @flows/web@0.7.0

### Features

- add fallback polling for node state
- add connectionId params to run api
- add support for text files
- add onWheel event to stop propagation
- support text type
- add port style classes for connection lines
- (flows) add auto-hide duration badge and improve auth error handling
- (flows) enhance error handling in flow editor

### Refactor

- optimize node execution by skipping unchanged config
- improve execution stats handling for terminal states
- optimize state update logic

### Chores

- update license from MIT to Apache-2.0

## [2026-03-18] - root@0.6.2, @flows/web@0.6.1

### Bug Fixes

- opt shortcut
- run w/ config

## [2026-03-12] - root@0.6.0, @flows/web@0.6.0

### Features

- (api) add dynamic API endpoint

### Documentation

- update README with new demo image
- update README and add LICENSE file

### Chores

- add issue templates and contributing guidelines
- (ci) update github actions and environment variables

### Other

- ci: add local deployment configuration

## [2026-03-12] - root@0.5.0, @flows/web@0.5.0

### Features

- clean git history

## [2026-03-10] - root@0.4.1, @flows/web@0.4.1

### Refactor

- simplify auth error handling

## [2026-03-10] - root@0.4.0, @flows/web@0.4.0

### Features

- add beta label to header
- add touch support for port connections and node interactions
- add image processing with config
- add support for loading workflow with missing port data

### Bug Fixes

- (ui-kit) prevent wheel event propagation

### Refactor

- simplify port data application and propagation
- extract port hit detection logic
- (api) simplify error handling logic
- add flowId check to handleNodeUpdate and handlePortUpdate
- optimize port update handling
- simplify node and port update handling

## [2026-03-06] - root@0.3.0, @flows/web@0.3.0

### Features

- add image editing functionality
- add node resizing functionality
- add separator config type
- update socket no logic
- add image copy to clipboard functionality
- improve content preview modal UI and feedback
- add JSON parsing and viewer for content preview
- add expand functionality and enhance tooltip rendering
- add content preview modal
- remove local fallback logic and enhance description display with markdown viewer
- (auth) add forbidden error handling and update dependencies

### Bug Fixes

- (auth) handle API key and permission errors

### Refactor

- migrate image editor to react-image-crop
- improve DebugLogVisualization component
- extract tooltip content rendering into reusable component
- simplify content preview modal and markdown viewer
- simplify getVisiblePorts logic
- (flows) improve description tooltip handling
- (api) remove handleAuthError and improve auth error handling

## [2026-03-05] - root@0.2.0, @flows/web@0.2.0

### Features

- add demo pages

## [2026-03-04] - root@0.1.0, @flows/web@0.1.0

### Features

- support mobile screen

## [2026-03-03] - No version updates

### Features

- (header) add menu groups and reorganize dropdown menu
- (ui) add version info to header dropdown

All notable changes to this project will be documented in this file.
