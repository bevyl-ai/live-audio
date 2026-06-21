# Releasing

`@bevyl-ai/live-audio` is published from `packages/live-audio`, not from the
repository root.

## npm Setup

Use npm trusted publishing for releases so the GitHub Actions workflow can
publish with OIDC instead of a long-lived npm token.

Configure npm with:

- Package: `@bevyl-ai/live-audio`
- GitHub organization/user: `bevyl-ai`
- GitHub repository: `live-audio`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

Then publish by creating a GitHub release or running the `Publish to npm`
workflow manually.

## Manual Dry Run

```bash
cd packages/live-audio
npm publish --access public --dry-run
```
