# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The watches of changedetection.io as Gladys devices, proposed in the
  Discover tab: unviewed change, in error, error message, last change, what
  changed, and price and in stock on the "Re-stock & Price detection" watches.
  A changedetection.io device counts the watches, those in error and the
  unviewed changes.
- Scene triggers for every watch, added or not: a page changed (with a short
  excerpt of what changed), a price dropped, back in stock, a watch fails.
- Scene actions: check a page now (or every page), mark as viewed.
- The "Latest changes" dashboard widget: unviewed changes, errors, the latest
  changes with their excerpt and a link to the page, Check now and Mark as
  viewed buttons.
- A Test the connection button, a connection status that names the problem,
  and a transport badge on every device.
- English, French, German and Spanish everywhere, documentation included.

[Unreleased]: https://github.com/guim31/gladys-changedetection/commits/main
