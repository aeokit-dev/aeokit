# GitHub public-launch checklist

Repository files prepare the community templates and dependency updates, but an
organization owner must apply the GitHub settings after `aeokit-dev/aeokit`
exists.

## Repository

- Create `aeokit-dev/aeokit` as an empty public repository. Publish a clean
  snapshot of the reviewed release tree as its single initial commit so old
  production metadata and private branch history are not transferred. Do not
  mirror the private repository.
- Set the description, homepage `https://aeokit.dev`, AGPL-3.0 license, and
  topics `aeo`, `ai-visibility`, `answer-engine-optimization`, and
  `self-hosted`.
- Enable Discussions before deploying links that point to it.

## Rules and security

- Add a `main` ruleset that requires pull requests, blocks force pushes and
  deletion, permits an administrator emergency bypass, and requires the
  `verify` GitHub Actions check before merging.
- Enable Dependabot alerts, secret scanning, push protection, and private
  vulnerability reporting.
- Confirm the security-reporting link in `SECURITY.md` opens a private advisory.

## Organization profile

Create a public `aeokit-dev/.github` repository containing
`profile/README.md` with:

```md
# aeokit

Open-source AI visibility tracking with auditable answers and citations.

- [Source and self-hosting](https://github.com/aeokit-dev/aeokit)
- [Hosted application](https://aeokit.dev)
- [Security](https://github.com/aeokit-dev/aeokit/security/policy)
```

Add the aeokit logo, `https://aeokit.dev`, and a short organization description
in the organization settings.

## Final verification

After making the repository public, clone it into a new directory, run the
documented Docker quick start, and confirm the README badges, Discussions,
issue forms, security link, and live application repository links all work.
