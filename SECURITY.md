# Security policy

## Supported releases

aeokit is an early release. Security fixes are applied to the latest release
and the default branch; older pre-`1.0` releases may not receive backports.

## Deployment boundaries

The hosted Cloudflare edition verifies users and workspaces with Clerk and
enforces tenant ownership on every protected request.

The Docker/PostgreSQL self-hosted edition is a trusted single-installation
deployment and does not include user authentication. Put it behind a private
network or an authenticated access proxy before exposing it remotely.

## Reporting a vulnerability

Report vulnerabilities through [GitHub private vulnerability
reporting](https://github.com/aeokit-dev/aeokit/security/advisories/new). Do not
open a public issue for a suspected vulnerability.

Include reproduction steps and the affected version or commit. Do not include
provider keys, raw model responses, customer data, or other credentials. The
maintainers will coordinate disclosure and remediation through the private
advisory.
