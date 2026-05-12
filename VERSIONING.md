# 25experts Page Versioning Policy

Every live HTML page must include these three `<meta>` tags in the `<head>`:

```html
<meta name="page-version" content="vYYYY.MM.DD.N">
<meta name="page-updated" content="YYYY-MM-DD">
<meta name="version-policy" content="Update page-version and page-updated on every content, design, SEO, or behavior change.">
```

## Rule

Any change to a live page must update:

- `page-version`: bump the final number for the same day, or reset to `.1` on a new date.
- `page-updated`: set to the date the page was changed.

This applies to content, copy, design, navigation, SEO metadata, forms, links, and behavior.

## Scope

Live root pages are versioned. Files with `mockup` in the filename, files inside `mockups/`, and local tool files are not part of the live version queue.

## Check

Run this before committing live page changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-page-versions.ps1
```
