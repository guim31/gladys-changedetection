# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the API key of changedetection.io is a `secret` field of the
  Gladys configuration. The integration reads it from Gladys at startup, keeps
  it in memory, sends it only to the changedetection.io typed in the
  configuration (`x-api-key` header), and never writes it to `/data` nor to the
  logs. Note that this key gives full access to the changedetection.io API;
  the integration only uses it to read the watches, check them now and mark
  them as viewed.
- **Stored in `/data`**: `changedetection-state.json`, per watch uuid: the
  last change and check times, whether it was in error, its processor, its last
  price and stock, and the excerpt of its last change (text of the watched
  page).
- **Network**: requests go only to the changedetection.io address typed in the
  configuration, in HTTP or HTTPS. HTTPS certificates are verified unless the
  user ticks "Accept self-signed certificates"; the integration opens no port
  and calls no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
changedetection.io itself (see its
[repository](https://github.com/dgtlmoon/changedetection.io/security)), and the
pages it watches.
