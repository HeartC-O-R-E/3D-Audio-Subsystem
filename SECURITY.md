# Security Policy

## Supported versions

The latest release is supported. Fixes are published as a new release rather than
backported.

## Reporting a vulnerability

Please report security issues privately, using GitHub's
[private vulnerability reporting](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/security/advisories/new)
rather than a public issue.

Include what the issue allows an attacker to do, how to reproduce it, and the
version you tested.

## Already-known issues

Two trust gaps are **documented, not secret**, and are described in full with
mitigations in
[Known Limitations](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/):

1. **Routing bucket claims are client-trusted by default.** A modified client can
   claim any routing bucket and have the server replay that bucket's sounds to it.
   Mitigate with `security.verifyRoutingBucket: true`. Separately, dimension
   filtering happens client-side, so routing buckets are not a privacy boundary
   for sound metadata even with verification on.

2. **Sound-end reports are unvalidated.** A client can report any sound ID as
   ended, removing it from the server's registry. The impact is limited to that
   sound no longer being replayed to players entering its routing bucket; it does
   not stop audio for anyone.

Reports about these are welcome if you have found an impact beyond what is
described there, but they are not undisclosed vulnerabilities.

## Scope

This resource plays audio files at coordinates. It stores no credentials, touches
no database, exposes no HTTP endpoint, and runs no code supplied over the network.
The attack surface is the two net event handlers listed above.

Note that `soundFile` arguments come from **your** resources, not from players. If
you pass player-controlled input as a sound path, that is a path-handling concern
in your code — `soundPath` traversal is rejected in config, but `soundFile` itself
is resolved by the browser against the resource root.
