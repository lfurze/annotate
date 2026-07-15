# Security policy

## Supported version

Until the first public release, only the current `main` branch is supported. A version
support table will be added when tagged releases exist.

## Reporting a vulnerability

Please do not publish an exploitable document or project file in a public issue.
After the repository is public, use GitHub's private vulnerability reporting feature
under **Security → Advisories → Report a vulnerability**. Before then, contact the
repository owner privately and include:

- the affected browser and operating system;
- the smallest safe reproduction or file;
- the observed and expected behaviour;
- whether code execution, an outbound request, or data disclosure occurred.

Do not include real confidential documents. A synthetic reproduction is preferred.

## Security boundaries

PDF, DOCX, images, and Annotate project files are untrusted input. They must not be
able to execute code, load hidden remote resources, access another project, or escape
the application's local storage boundary. The editable HTML project format is data,
not an authority to run scripts.

The hosted application necessarily downloads its own static assets. Annotate's
privacy guarantee covers document content and annotations; it does not conceal normal
connections to the chosen static host.

## Disclosure process

Reports will be acknowledged as soon as practical, reproduced against the supported
branch, and assessed for impact. A fix and regression test should be prepared before
public disclosure. Credit will be given when requested and when it is safe to do so.
