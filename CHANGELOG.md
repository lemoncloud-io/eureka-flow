# Changelog

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

